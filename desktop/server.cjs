'use strict';

const { createServer } = require('node:http');
const { createReadStream } = require('node:fs');
const { realpath, stat } = require('node:fs/promises');
const { resolve, relative, isAbsolute, extname } = require('node:path');
const { pipeline } = require('node:stream/promises');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.onnx': 'application/octet-stream',
};

// WASM compilation is allowed without granting JavaScript eval. Workers and
// images can use blob URLs created from local files; no remote resources load.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

function isInside(root, candidate) {
  const child = relative(root, candidate);
  return child !== '' && child !== '..' && !child.startsWith('..\\') && !child.startsWith('../') && !isAbsolute(child);
}

function sendError(response, status, message, head) {
  response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end(head ? undefined : message);
}

async function startAppServer(directory) {
  const root = await realpath(directory);
  const index = await realpath(resolve(root, 'index.html'));
  if (!isInside(root, index) || !(await stat(index)).isFile()) {
    throw new Error('找不到完整的应用文件，请重新下载豆图 Windows 程序。');
  }
  let origin;
  const server = createServer(async (request, response) => {
    const head = request.method === 'HEAD';
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    response.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    response.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), usb=(), serial=(), hid=(), clipboard-read=()');

    // The exact listening address prevents DNS rebinding and mismatched ports.
    if (!origin || request.headers.host !== new URL(origin).host ||
        (request.headers.origin && request.headers.origin !== origin)) {
      sendError(response, 403, '只能从豆图本机窗口访问应用。', head);
      return;
    }
    if (request.method !== 'GET' && !head) {
      response.setHeader('Allow', 'GET, HEAD');
      sendError(response, 405, '应用服务仅支持读取。', head);
      return;
    }
    let pathname;
    try {
      // Parse before URL normalization so encoded dot segments cannot silently
      // turn into another resource. Reject Windows paths and alternate streams.
      const raw = request.url ?? '';
      if (!raw.startsWith('/') || raw.startsWith('//')) throw new Error('path');
      pathname = decodeURIComponent(raw.split('?')[0]);
      if (/[\0\\:]/.test(pathname) || pathname.split('/').some(part => part.startsWith('.'))) {
        sendError(response, 403, '无效的应用文件路径。', head);
        return;
      }
    } catch {
      sendError(response, 400, '无效的应用文件地址。', head);
      return;
    }
    const requested = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!isInside(root, requested)) {
      sendError(response, 403, '不能读取应用目录之外的文件。', head);
      return;
    }
    try {
      const file = await realpath(requested);
      if (!isInside(root, file)) {
        sendError(response, 403, '不能读取应用目录之外的文件。', head);
        return;
      }
      const info = await stat(file);
      if (!info.isFile()) {
        sendError(response, 404, '应用文件不存在。', head);
        return;
      }
      response.writeHead(200, {
        'Content-Type': MIME_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
        'Content-Length': info.size,
      });
      if (head) response.end();
      else await pipeline(createReadStream(file), response);
    } catch (error) {
      if (response.headersSent) response.destroy();
      else sendError(response, error.code === 'ENOENT' || error.code === 'ENOTDIR' ? 404 : 500, '应用文件无法读取。', head);
    }
  });

  await new Promise((accept, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      origin = `http://127.0.0.1:${server.address().port}`;
      accept();
    });
  });
  return {
    origin,
    close: () => new Promise(resolveClose => {
      server.close(resolveClose);
      server.closeAllConnections();
    }),
  };
}

module.exports = { CONTENT_SECURITY_POLICY, isInside, startAppServer };
