'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { request } = require('node:http');
const { mkdtemp, mkdir, writeFile, rm, symlink } = require('node:fs/promises');
const { join, dirname, basename } = require('node:path');
const { tmpdir } = require('node:os');
const { startAppServer } = require('./server.cjs');

function read(origin, path, { method = 'GET', headers = {} } = {}) {
  const url = new URL(origin);
  return new Promise((accept, reject) => {
    const req = request({ hostname: url.hostname, port: url.port, path, method, headers }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => accept({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'bead-desktop-test-'));
  const root = join(directory, 'dist');
  await mkdir(root);
  await writeFile(join(root, 'index.html'), '<html>豆图</html>');
  await writeFile(join(root, 'model.onnx'), Buffer.from([1, 2, 3, 4]));
  await writeFile(join(root, 'engine.wasm'), Buffer.from([0, 97, 115, 109]));
  await writeFile(join(directory, 'secret.txt'), 'outside');
  const server = await startAppServer(root);
  t.after(async () => {
    await server.close();
    // The recursive cleanup is limited to this exact generated test fixture.
    assert.equal(dirname(directory), tmpdir());
    assert.ok(basename(directory).startsWith('bead-desktop-test-'));
    await rm(directory, { recursive: true, force: true });
  });
  return { ...server, directory, root };
}

test('local server serves data bytes with isolated WASM headers and CSP', async t => {
  const { origin } = await fixture(t);
  const page = await read(origin, '/');
  assert.equal(page.status, 200);
  assert.match(page.body.toString(), /豆图/);
  assert.equal(page.headers['cross-origin-opener-policy'], 'same-origin');
  assert.equal(page.headers['cross-origin-embedder-policy'], 'require-corp');
  assert.equal(page.headers['cross-origin-resource-policy'], 'same-origin');
  assert.match(page.headers['content-security-policy'], /script-src 'self' 'wasm-unsafe-eval'/);
  assert.match(page.headers['content-security-policy'], /connect-src 'self'/);
  const model = await read(origin, '/model.onnx?v=1');
  assert.deepEqual(model.body, Buffer.from([1, 2, 3, 4]));
  assert.equal(model.headers['content-length'], '4');
  const wasm = await read(origin, '/engine.wasm', { method: 'HEAD' });
  assert.equal(wasm.status, 200);
  assert.equal(wasm.headers['content-type'], 'application/wasm');
  assert.equal(wasm.body.length, 0);
});

test('host and Origin validation reject remote sites and mismatched loopback hosts', async t => {
  const { origin } = await fixture(t);
  for (const host of ['evil.example', 'localhost:' + new URL(origin).port, '127.0.0.1:1']) {
    assert.equal((await read(origin, '/', { headers: { Host: host } })).status, 403);
  }
  assert.equal((await read(origin, '/', { headers: { Origin: 'https://example.com' } })).status, 403);
  assert.equal((await read(origin, '/', { headers: { Origin: origin } })).status, 200);
});

test('server refuses writes, encoded traversal, Windows alternate streams and malformed URLs', async t => {
  const { origin } = await fixture(t);
  const post = await read(origin, '/', { method: 'POST' });
  assert.equal(post.status, 405);
  assert.equal(post.headers.allow, 'GET, HEAD');
  for (const path of ['/../secret.txt', '/%2e%2e/secret.txt', '/%2E%2e%2fsecret.txt', '/..%5csecret.txt', '/index.html::$DATA', '/%00x', '/.hidden']) {
    assert.equal((await read(origin, path)).status, 403, path);
  }
  assert.equal((await read(origin, '/%zz')).status, 400);
  assert.equal((await read(origin, '//evil.example/index.html')).status, 400);
  assert.equal((await read(origin, '/missing')).status, 404);
});

test('realpath validation prevents junctions from reading outside the application', async t => {
  const { origin, root, directory } = await fixture(t);
  await mkdir(join(directory, 'outside'));
  await writeFile(join(directory, 'outside', 'private.txt'), 'not for serving');
  try { await symlink(join(directory, 'outside'), join(root, 'linked'), 'junction'); }
  catch (error) { if (error.code === 'EPERM') return t.skip('Windows account cannot create a test junction'); throw error; }
  assert.equal((await read(origin, '/linked/private.txt')).status, 403);
});
