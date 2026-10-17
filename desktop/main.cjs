'use strict';

const { app, BrowserWindow, Menu, dialog, ipcMain, screen, session, shell } = require('electron');
const { join, isAbsolute, basename } = require('node:path');
const { mkdirSync, appendFileSync } = require('node:fs');
const { startAppServer } = require('./server.cjs');
const { isAppDocument, isLocalResource, isSafeExternalUrl, downloadOptions } = require('./policy.cjs');

let mainWindow;
let localServer;
let quitting = false;

app.setName('豆图');
app.setAppUserModelId('com.chocotacco150.beadstudio');

// An explicit development-only QA destination exercises the real Chromium
// DownloadItem pipeline without writing into the user's Documents directory.
// Packaged executables ignore this argument and always show the native dialog.
const smokeArg = process.argv.find(value => value.startsWith('--bead-desktop-smoke-dir='));
const smokeDirectory = !app.isPackaged && smokeArg ? smokeArg.slice('--bead-desktop-smoke-dir='.length) : null;
if (smokeDirectory && !isAbsolute(smokeDirectory)) throw new Error('桌面 QA 目录必须是绝对路径。');
if (smokeDirectory) mkdirSync(join(smokeDirectory, 'profile'), { recursive: true });

// This uses a stable per-user profile outside the portable EXE's temporary
// extraction directory. No images or project data are written here by the host.
const profileDirectory = smokeDirectory ? join(smokeDirectory, 'profile') : join(app.getPath('appData'), 'BeadStudio');
mkdirSync(profileDirectory, { recursive: true });
app.setPath('userData', profileDirectory);
if (smokeDirectory) app.setPath('sessionData', join(smokeDirectory, 'profile'));

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => {
    quitting = true;
    void localServer?.close();
  });

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    const directory = app.isPackaged ? join(process.resourcesPath, 'dist') : join(__dirname, '..', 'dist');
    localServer = await startAppServer(directory);
    const { origin } = localServer;
    const appSession = session.fromPartition('persist:bead-studio');

    appSession.setPermissionCheckHandler((contents, permission, requestingOrigin) =>
      permission === 'clipboard-sanitized-write' && requestingOrigin === origin &&
      contents === mainWindow?.webContents && mainWindow.isFocused());
    appSession.setPermissionRequestHandler((contents, permission, callback, details) => {
      callback(permission === 'clipboard-sanitized-write' && contents === mainWindow?.webContents &&
        mainWindow.isFocused() && isAppDocument(details.requestingUrl, origin));
    });
    appSession.setDevicePermissionHandler(() => false);
    appSession.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
      callback({ cancel: !isLocalResource(details.url, origin) });
    });

    const workArea = screen.getPrimaryDisplay().workAreaSize;
    mainWindow = new BrowserWindow({
      title: '豆图 · 图片转拼豆图纸',
      width: Math.min(1480, workArea.width), height: Math.min(960, workArea.height),
      minWidth: Math.min(1050, workArea.width), minHeight: Math.min(700, workArea.height),
      show: false,
      backgroundColor: '#f6f8f8',
      autoHideMenuBar: true,
      webPreferences: {
        session: appSession,
        preload: join(__dirname, 'preload.cjs'),
        nodeIntegration: false,
        nodeIntegrationInWorker: false,
        nodeIntegrationInSubFrames: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
        webviewTag: false,
        navigateOnDragDrop: false,
        safeDialogs: true,
        safeDialogsMessage: '请先关闭当前提示。',
        spellcheck: false,
      },
    });
    const contents = mainWindow.webContents;
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    contents.on('will-navigate', (event, url) => {
      if (!isAppDocument(event.url ?? url, origin)) event.preventDefault();
    });
    contents.on('will-frame-navigate', event => {
      if (!event.isMainFrame || !isAppDocument(event.url, origin)) event.preventDefault();
    });
    contents.on('will-redirect', event => event.preventDefault());
    contents.on('will-attach-webview', event => event.preventDefault());
    contents.on('content-bounds-updated', event => event.preventDefault());

    ipcMain.on('bead:open-external', (event, url) => {
      if (event.sender !== contents || event.senderFrame !== contents.mainFrame ||
          !isAppDocument(event.senderFrame.url, origin) || !mainWindow.isFocused() || !isSafeExternalUrl(url)) return;
      void shell.openExternal(url).catch(() => {
        if (!mainWindow.isDestroyed()) void dialog.showMessageBox(mainWindow, {
          type: 'error', title: '无法打开链接', message: '未能打开系统浏览器，请稍后再试。',
        });
      });
    });

    appSession.on('will-download', (event, item, source) => {
      const url = item.getURL();
      const options = downloadOptions(item.getFilename(), app.getPath('documents'));
      // Existing canvas/JSON/PDF exports generate same-origin blob URLs. The
      // native Electron save dialog keeps the large bytes out of privileged IPC.
      if (source !== contents || !isAppDocument(contents.getURL(), origin) ||
          !url.startsWith(`blob:${origin}/`) || !options) {
        event.preventDefault();
        return;
      }
      item.setSaveDialogOptions(options);
      if (smokeDirectory) item.setSavePath(join(smokeDirectory, basename(options.defaultPath)));
      item.once('done', (_event, state) => {
        if (smokeDirectory) appendFileSync(join(smokeDirectory, 'downloads.jsonl'), JSON.stringify({
          filename: item.getFilename(), mimeType: item.getMimeType(), state,
          receivedBytes: item.getReceivedBytes(), totalBytes: item.getTotalBytes(),
          savePath: item.getSavePath(), dialogOptions: options,
        }) + '\n');
        if (state === 'interrupted' && !quitting && !mainWindow.isDestroyed()) {
          void dialog.showMessageBox(mainWindow, {
            type: 'error', title: '文件未能保存',
            message: '导出文件保存失败，请检查目标位置是否可写、磁盘空间是否充足，然后重新导出。',
          });
        }
      });
    });

    mainWindow.once('ready-to-show', () => mainWindow.show());
    contents.on('render-process-gone', (_event, details) => {
      if (!quitting && details.reason !== 'clean-exit') {
        dialog.showErrorBox('豆图窗口已停止', '应用窗口意外停止。请重新打开豆图，再加载之前保存的项目 JSON。');
        app.quit();
      }
    });
    await mainWindow.loadURL(origin + '/');
  }).catch(error => {
    console.error('豆图桌面启动失败:', error.message);
    dialog.showErrorBox('豆图无法启动', '未能打开本机应用。请确认文件完整，或重新下载 Windows 程序。\n\n' + error.message);
    app.quit();
  });
}
