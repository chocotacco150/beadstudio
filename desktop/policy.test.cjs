'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isAppDocument, isLocalResource, isSafeExternalUrl, downloadOptions } = require('./policy.cjs');
const { join } = require('node:path');

const origin = 'http://127.0.0.1:5180';

test('navigation is restricted to the app document on the exact loopback origin', () => {
  for (const value of [origin + '/', origin + '/index.html', origin + '/#pattern']) assert.equal(isAppDocument(value, origin), true);
  for (const value of [origin + '/models/file.onnx', 'http://127.0.0.1:5181/', 'https://example.com/', 'file:///etc/passwd', 'not a URL']) {
    assert.equal(isAppDocument(value, origin), false, value);
  }
});

test('resource requests allow local workers, models and image blobs while blocking network and file reads', () => {
  for (const value of [origin + '/models/u2net.onnx', `blob:${origin}/uuid`, 'data:image/png;base64,AAAA']) assert.equal(isLocalResource(value, origin), true);
  for (const value of ['https://example.com/x', 'http://127.0.0.1:5181/x', 'file:///C:/private.txt', 'blob:https://example.com/uuid', 'ws://127.0.0.1:5180/x']) {
    assert.equal(isLocalResource(value, origin), false, value);
  }
});

test('system browser policy accepts only HTTPS with no credentials or control characters', () => {
  assert.equal(isSafeExternalUrl('https://commons.wikimedia.org/wiki/File:Sunflower_Public_Domain.jpg'), true);
  for (const value of ['http://example.com', 'file:///x', 'javascript:alert(1)', 'https://user:secret@example.com', 'https://example.com\n/path', 'https://example.com/a b', '', null]) {
    assert.equal(isSafeExternalUrl(value), false, String(value));
  }
});

test('all application export formats have a native save filter and a bounded filename', () => {
  for (const extension of ['png', 'pdf', 'csv', 'html', 'json']) {
    const options = downloadOptions('我的图纸.' + extension, 'C:/Documents');
    assert.equal(options.defaultPath, join('C:/Documents', '我的图纸.' + extension));
    assert.deepEqual(options.filters[0].extensions, [extension]);
    assert.ok(options.properties.includes('showOverwriteConfirmation'));
  }
  const options = downloadOptions('a'.repeat(200) + '.png', 'C:/Documents');
  assert.equal(require('node:path').basename(options.defaultPath).length, 154);
});

test('save filenames reject executable formats and cannot escape the chosen directory', () => {
  assert.equal(downloadOptions('bad.exe', 'C:/Documents'), null);
  assert.equal(downloadOptions('bad.png.exe', 'C:/Documents'), null);
  assert.equal(downloadOptions('file', 'C:/Documents'), null);
  assert.equal(downloadOptions('..\\..\\图纸.png', 'C:/Documents').defaultPath, join('C:/Documents', '图纸.png'));
  assert.equal(downloadOptions('CON.json', 'C:/Documents').defaultPath, join('C:/Documents', '_CON.json'));
});
