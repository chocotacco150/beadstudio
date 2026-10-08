import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, sep, extname } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { spawn } from 'node:child_process';

// Serve the built application only. Image conversion and exports stay in the browser.
let root;
try {
  root = await realpath(fileURLToPath(new URL('../dist/', import.meta.url)));
  await stat(resolve(root, 'index.html'));
} catch {
  console.error('找不到 dist/index.html。请完整解压运行包；开发源码请先执行 npm run build。');
  process.exit(1);
}

const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const initialPort = portIndex === -1 ? 5173 : Number(args[portIndex + 1]);
if (!Number.isInteger(initialPort) || initialPort < 0 || initialPort > 65535) {
  console.error('端口无效，请使用 0–65535 之间的整数。');
  process.exit(1);
}
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
};
const insideRoot = (path) => path.startsWith(root + sep);
function errorResponse(res, status, message, head = false) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(head ? undefined : message);
}

const server = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-cache');
  const head = req.method === 'HEAD';
  if (req.method !== 'GET' && !head) {
    res.setHeader('Allow', 'GET, HEAD');
    errorResponse(res, 405, '仅支持读取本地应用。');
    return;
  }
  if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/i.test(req.headers.host ?? '')) {
    errorResponse(res, 403, '请通过启动时显示的本地地址访问。', head);
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
  } catch {
    errorResponse(res, 400, '无效的文件地址。', head);
    return;
  }
  if (pathname.includes('\0') || pathname.includes('\\')) {
    errorResponse(res, 400, '无效的文件地址。', head);
    return;
  }
  const requested = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!insideRoot(requested)) {
    errorResponse(res, 403, '不能访问应用目录之外的文件。', head);
    return;
  }
  try {
    const file = await realpath(requested);
    if (!insideRoot(file)) {
      errorResponse(res, 403, '不能访问应用目录之外的文件。', head);
      return;
    }
    const info = await stat(file);
    if (!info.isFile()) {
      errorResponse(res, 404, '文件不存在。', head);
      return;
    }
    res.writeHead(200, {
      'Content-Type': mime[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': info.size,
    });
    if (head) res.end();
    else await pipeline(createReadStream(file), res);
  } catch (error) {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    const missing = error.code === 'ENOENT' || error.code === 'ENOTDIR';
    errorResponse(res, missing ? 404 : 500, missing ? '文件不存在。' : '文件读取失败。', head);
  }
});

function listen(port) {
  return new Promise((accept, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.removeListener('error', reject);
      accept();
    });
  });
}
let started = false;
for (let offset = 0; offset <= 20; offset++) {
  const port = initialPort === 0 ? 0 : initialPort + offset;
  if (port > 65535) break;
  try {
    await listen(port);
    started = true;
    break;
  } catch (error) {
    if (error.code !== 'EADDRINUSE') {
      console.error('本地服务启动失败：' + error.message);
      process.exit(1);
    }
  }
}
if (!started) {
  console.error('附近端口均被占用，请关闭其他实例后再试，或使用 --port 指定其他端口。');
  process.exit(1);
}
const url = `http://127.0.0.1:${server.address().port}`;
console.log(`豆图 · 图片转拼豆图纸\n本地地址：${url}\n请保持此窗口打开；关闭窗口或按 Ctrl+C 停止。\n图纸请在页面中保存为项目 JSON，以便下次继续。`);
if (args.includes('--open')) {
  const command = process.platform === 'win32' ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const browser = spawn(command, [url], { detached: true, stdio: 'ignore', windowsHide: true });
  browser.on('error', () => console.log('未能自动打开浏览器，请手动打开上面的本地地址。'));
  browser.unref();
}
function stop() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
