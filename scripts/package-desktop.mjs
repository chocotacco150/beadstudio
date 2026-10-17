import { createReadStream } from 'node:fs';
import { copyFile, mkdir, open, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const flags = new Set(process.argv.slice(2));
if ([...flags].some((flag) => !['--verify-only', '--skip-build'].includes(flag))) {
  throw new Error('支持的参数：--verify-only（仅校验）或 --skip-build（使用已有生产构建）。');
}
const sourcePackage = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
if (!/^\d+\.\d+\.\d+$/.test(sourcePackage.version)) throw new Error('桌面发行版必须使用正式的 x.y.z 版本号。');
const version = sourcePackage.version;
const releaseDirectory = join(root, 'artifacts', 'desktop-release');
const stageDirectory = join(root, 'artifacts', 'desktop-package');
const stageApp = join(stageDirectory, 'app');
const stageLicenses = join(stageDirectory, 'licenses');
const modelFiles = ['u2netp.onnx', 'u2net.onnx'];
const wasmFiles = ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm'];

function assertOwnedPath(path, owner) {
  const child = relative(owner, path);
  if (!child || child.startsWith(`..${sep}`) || child === '..' || isAbsolute(child)) {
    throw new Error(`输出路径不在预期的任务目录内：${path}`);
  }
}
async function sha256(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
async function file(path) {
  const info = await stat(path).catch(() => { throw new Error(`缺少文件：${relative(root, path)}`); });
  if (!info.isFile()) throw new Error(`需要普通文件：${relative(root, path)}`);
  return info;
}
function runNode(script, args = []) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: root, stdio: 'inherit', windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${relative(root, script)} 执行失败，退出码 ${result.status}。`);
}
async function walk(directory, prefix = '') {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error(`发行资源不能含符号链接：${path}`);
    if (entry.isDirectory()) result.push(...await walk(path, name));
    else if (entry.isFile()) result.push(name);
    else throw new Error(`不支持的发行资源：${path}`);
  }
  return result;
}
async function compareFiles(left, right, message) {
  const [leftInfo, rightInfo] = await Promise.all([file(left), file(right)]);
  if (leftInfo.size !== rightInfo.size || await sha256(left) !== await sha256(right)) throw new Error(message);
}
async function verifyProduction() {
  const manifest = JSON.parse(await readFile(join(root, 'public/models/manifest.json'), 'utf8'));
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.models)) throw new Error('不支持的模型清单版本。');
  await compareFiles(join(root, 'public/models/manifest.json'), join(root, 'dist/models/manifest.json'), '模型清单的生产副本过期，请重新构建。');
  for (const name of modelFiles) {
    const matches = manifest.models.filter((model) => model.file === name);
    if (matches.length !== 1) throw new Error(`模型清单需要唯一的 ${name} 条目。`);
    const model = matches[0];
    if (!Number.isSafeInteger(model.bytes) || model.bytes <= 0 || !/^[a-f0-9]{64}$/.test(model.sha256)) throw new Error(`模型清单无效：${name}`);
    for (const folder of ['public/models', 'dist/models']) {
      const path = join(root, folder, name);
      if ((await file(path)).size !== model.bytes || await sha256(path) !== model.sha256) throw new Error(`模型校验失败：${folder}/${name}，请重新下载或构建。`);
    }
  }
  const installedOrt = JSON.parse(await readFile(join(root, 'node_modules/onnxruntime-web/package.json'), 'utf8'));
  if (sourcePackage.dependencies?.['onnxruntime-web'] !== installedOrt.version) throw new Error('ONNX Runtime 版本必须与 package.json 的精确版本一致。');
  const ortDirectory = dirname(require.resolve('onnxruntime-web/wasm'));
  for (const name of wasmFiles) {
    await compareFiles(join(ortDirectory, name), join(root, 'public/cutout-runtime', name), `公共目录的 ONNX Runtime ${name} 与依赖版本不一致。`);
    await compareFiles(join(ortDirectory, name), join(root, 'dist/cutout-runtime', name), `生产构建的 ONNX Runtime ${name} 过期，请重新构建。`);
  }
  const required = ['dist/index.html', 'dist/models/README.md', 'dist/models/U2NET-APACHE-2.0.txt', 'dist/models/REMBG-MIT.txt', 'dist/cutout-runtime/LICENSE-onnxruntime.txt', 'dist/sample-photo-license.txt'];
  await Promise.all(required.map((path) => file(join(root, path))));
  const entries = await walk(join(root, 'dist'));
  if (entries.some((name) => /(^|\/)(\.git|\.openai|node_modules|src|artifacts|runtime)(\/|$)|\.bead\.json$|\.(map|ts|tsx|log)$/i.test(name))) throw new Error('生产构建含源码、调试文件或个人图纸，请清理后重新构建。');
  if (!entries.some((name) => /^assets\/.+\.js$/.test(name))) throw new Error('没有找到 Vite 生产脚本。');
  console.log(`资源校验通过：${entries.length} 个生产文件，两种模型和 ONNX Runtime ${installedOrt.version}。`);
  return { manifest, entries, ortVersion: installedOrt.version };
}

// Package only the desktop shell. The browser dependencies have already been bundled by Vite.
// A minimal staging package avoids electron-builder automatically copying production node_modules.
async function prepareApp() {
  if (sourcePackage.main !== 'desktop/main.cjs') throw new Error('package.json 的 main 必须是 desktop/main.cjs。');
  await file(join(root, sourcePackage.main));
  await file(join(root, 'build-resources/app.ico'));
  await file(join(root, 'build-resources/startup.bmp'));
  const artifactRoot = join(root, 'artifacts');
  await mkdir(artifactRoot, { recursive: true });
  assertOwnedPath(stageDirectory, artifactRoot);
  const existingStage = await realpath(stageDirectory).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
    return null;
  });
  if (existingStage) {
    assertOwnedPath(existingStage, await realpath(artifactRoot));
    // Only the dedicated, resolved staging directory created by this script is replaced.
    await rm(existingStage, { recursive: true, force: true });
  }
  await mkdir(stageApp, { recursive: true });
  await mkdir(stageLicenses, { recursive: true });
  const desktopEntries = (await walk(join(root, 'desktop'))).filter((name) => ['.cjs', '.mjs', '.json'].includes(extname(name)) && !/\.(test|spec)\.|(^|\/)(__tests__|fixtures)(\/|$)/.test(name));
  for (const name of desktopEntries) {
    const destination = join(stageApp, 'desktop', name);
    assertOwnedPath(destination, stageApp);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(join(root, 'desktop', name), destination);
  }
  const minimalPackage = {
    name: sourcePackage.name, version, private: true,
    description: sourcePackage.description || '豆图 · 图片转拼豆图纸，支持本机 AI 抠图。',
    author: sourcePackage.author || 'chocotacco150', license: 'UNLICENSED',
    main: sourcePackage.main, dependencies: {},
  };
  await writeFile(join(stageApp, 'package.json'), `${JSON.stringify(minimalPackage, null, 2)}\n`);
  await writeDependencyNotices();
}

async function writeDependencyNotices() {
  const notices = ['豆图桌面版 · 第三方软件声明', '', 'Electron 的完整许可及 Chromium 声明由运行包中的 LICENSE.electron.txt、LICENSES.chromium.html 提供。', 'U²-Net / rembg 模型来源和许可见 resources/dist/models。ONNX Runtime 许可见 resources/dist/cutout-runtime。', '以下为网页生产依赖及其依赖的声明；应用自身保留全部权利。', ''];
  const seen = new Set();
  async function visit(name, parentRequire) {
    let packagePath;
    try { packagePath = parentRequire.resolve(`${name}/package.json`); }
    catch {
      let entry;
      try { entry = parentRequire.resolve(name); } catch { return; }
      let candidate = dirname(entry);
      while (candidate !== dirname(candidate)) {
        try {
          const metadata = JSON.parse(await readFile(join(candidate, 'package.json'), 'utf8'));
          if (metadata.name === name) { packagePath = join(candidate, 'package.json'); break; }
        } catch { /* Look up from the resolved module entrypoint. */ }
        candidate = dirname(candidate);
      }
    }
    if (!packagePath || seen.has(packagePath)) return;
    seen.add(packagePath);
    const metadata = JSON.parse(await readFile(packagePath, 'utf8'));
    const directory = dirname(packagePath);
    notices.push(`===== ${metadata.name} ${metadata.version} =====`, `License: ${typeof metadata.license === 'string' ? metadata.license : JSON.stringify(metadata.license || 'See package notices')}`, '');
    const licenseNames = (await readdir(directory)).filter((entry) => /^(license|licence|copying|notice|copyright)(\.|$|-)/i.test(entry));
    if (licenseNames.length) {
      for (const license of licenseNames) if ((await stat(join(directory, license))).isFile()) notices.push(await readFile(join(directory, license), 'utf8'), '');
    } else if (metadata.name === 'onnxruntime-web' || metadata.name === 'onnxruntime-common') {
      notices.push(await readFile(join(root, 'scripts/licenses/ONNXRuntime-MIT.txt'), 'utf8'), '');
    } else notices.push(`上游：${typeof metadata.repository === 'string' ? metadata.repository : metadata.repository?.url || metadata.homepage || metadata.name}`, '');
    const localRequire = createRequire(packagePath);
    for (const dependency of Object.keys(metadata.dependencies || {}).sort()) await visit(dependency, localRequire);
  }
  for (const name of Object.keys(sourcePackage.dependencies || {}).sort()) await visit(name, require);
  await writeFile(join(stageLicenses, 'THIRD-PARTY-NOTICES.txt'), `${notices.join('\n')}\n`);
}

async function verifyExecutable(path, x64 = false) {
  const info = await file(path);
  const handle = await open(path, 'r');
  try {
    const header = Buffer.alloc(64);
    if ((await handle.read(header, 0, header.length, 0)).bytesRead !== header.length || header.toString('ascii', 0, 2) !== 'MZ') throw new Error('输出文件不是有效的 Windows 可执行文件。');
    const peOffset = header.readUInt32LE(0x3c);
    const pe = Buffer.alloc(6);
    if ((await handle.read(pe, 0, pe.length, peOffset)).bytesRead !== pe.length || pe.toString('ascii', 0, 4) !== 'PE\0\0') throw new Error('输出文件没有有效的 PE 头。');
    if (x64 && pe.readUInt16LE(4) !== 0x8664) throw new Error('内嵌应用不是 Windows x64 程序。');
  } finally { await handle.close(); }
  return info;
}
async function verifyPackage(production) {
  const unpacked = join(releaseDirectory, 'win-unpacked');
  await verifyExecutable(join(unpacked, 'BeadStudio.exe'), true);
  for (const name of production.entries) await compareFiles(join(root, 'dist', name), join(unpacked, 'resources/dist', name), `打包后的生产资源不一致：${name}`);
  const asar = await readFile(join(unpacked, 'resources/app.asar'));
  const headerLength = asar.readUInt32LE(12);
  const header = JSON.parse(asar.toString('utf8', 16, 16 + headerLength));
  const roots = Object.keys(header.files || {});
  if (roots.some((name) => !['package.json', 'desktop'].includes(name)) || !header.files.desktop?.files?.['main.cjs']) throw new Error('桌面 ASAR 内容异常：只能包含 package.json 和 desktop 主进程文件。');
  await file(join(unpacked, 'resources/licenses/THIRD-PARTY-NOTICES.txt'));
  await file(join(unpacked, 'LICENSE.electron.txt'));
  await file(join(unpacked, 'LICENSES.chromium.html'));
  const executable = join(releaseDirectory, `BeadStudio-${version}-Windows-x64.exe`);
  if ((await verifyExecutable(executable)).size < 50 * 1024 * 1024) throw new Error('便携版体积异常，可能没有嵌入完整 Electron 或模型。');
  return executable;
}
async function desktopPath() {
  if (process.platform !== 'win32') throw new Error('请在 Windows 上运行桌面打包脚本。');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', '[Console]::OutputEncoding = [Text.UTF8Encoding]::new(); [Environment]::GetFolderPath("Desktop")'], { encoding: 'utf8', windowsHide: true });
  if (result.error || result.status !== 0 || !result.stdout.trim()) throw new Error('无法定位当前用户桌面目录。');
  return result.stdout.trim();
}

try {
  if (!flags.has('--verify-only') && !flags.has('--skip-build')) {
    console.log('正在从源码构建前端…');
    runNode(join(root, 'scripts/prepare-cutout-runtime.mjs'));
    runNode(join(root, 'node_modules/typescript/bin/tsc'), ['-b']);
    runNode(join(root, 'node_modules/vite/bin/vite.js'), ['build']);
  }
  const production = await verifyProduction();
  if (flags.has('--verify-only')) process.exit(0);
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('此脚本用于 Windows x64 本机打包。');
  await prepareApp();
  const electronMetadata = JSON.parse(await readFile(join(root, 'node_modules/electron/package.json'), 'utf8'));
  if (sourcePackage.devDependencies?.electron !== electronMetadata.version) throw new Error('Electron 必须使用与 package.json 一致的精确版本。');
  process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
  const { build, Platform, Arch } = await import('electron-builder');
  console.log(`正在内嵌 Electron ${electronMetadata.version} 和全部本地抠图资源…`);
  let startupOptionsVerified = false;
  await build({
    projectDir: root, targets: Platform.WINDOWS.createTarget('portable', Arch.x64), publish: 'never',
    config: join(root, 'electron-builder.yml'),
    // Check the compiler's actual options. In builder 26.15.3 the behavior of
    // unpackDirName is reversed from its docs; a fixed directory lets a second
    // launcher delete the first running window's models before its instance lock.
    effectiveOptionComputed: async ([defines, commands]) => {
      if (!defines.APP_DIR_64 || defines.APP_64 || 'UNPACK_DIR_NAME' in defines ||
          !defines.SPLASH_IMAGE || commands.SetCompressor !== 'zlib') {
        throw new Error('启动配置不符合要求：必须直接展开文件、使用每次启动独立的临时目录并显示启动提示。');
      }
      startupOptionsVerified = true;
      return false;
    },
  });
  if (!startupOptionsVerified) throw new Error('打包器未执行启动配置校验。');
  const executable = await verifyPackage(production);
  const desktop = await desktopPath();
  const outputName = `豆图-v${version}-Windows.exe`;
  const output = join(desktop, outputName);
  assertOwnedPath(output, desktop);
  await copyFile(executable, output);
  const hash = await sha256(output);
  const packageManifest = {
    product: '豆图', version, platform: 'win32-x64', target: 'portable',
    file: outputName, bytes: (await file(output)).size, sha256: hash,
    electron: electronMetadata.version, onnxRuntime: production.ortVersion,
    signed: false, localOnly: true, modelCopies: 1,
    startup: { extraction: 'direct-files', directory: 'per-launch-temporary', splash: true },
    models: production.manifest.models.map(({ file: name, bytes, sha256: modelHash }) => ({ file: name, bytes, sha256: modelHash })),
  };
  await writeFile(join(releaseDirectory, 'PACKAGE-MANIFEST.json'), `${JSON.stringify(packageManifest, null, 2)}\n`);
  await writeFile(join(releaseDirectory, 'SHA256SUMS.txt'), `${hash}  ${outputName}\n`);
  console.log(`已生成并复制到桌面：${output}\nSHA-256：${hash}\n只需分享这一个 .exe；使用时会自动展开内嵌资源，无需 Node.js、npm 或手动解压。`);
} catch (error) {
  console.error(`桌面打包失败：${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
}
