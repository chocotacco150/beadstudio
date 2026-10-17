'use strict';

const { basename, extname } = require('node:path');

function isAppDocument(value, origin) {
  try {
    const url = new URL(value);
    return url.origin === origin && (url.pathname === '/' || url.pathname === '/index.html');
  } catch { return false; }
}

function isLocalResource(value, origin) {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' && url.origin === origin) ||
      (url.protocol === 'blob:' && url.origin === origin) || url.protocol === 'data:';
  } catch { return false; }
}

function isSafeExternalUrl(value) {
  if (typeof value !== 'string' || value.length > 4096 || /[\u0000-\u0020\u007f]/.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password;
  } catch { return false; }
}

const DOWNLOAD_FORMATS = {
  '.png': 'PNG 图片', '.pdf': 'PDF 图纸', '.csv': 'CSV 用量清单',
  '.html': 'HTML 分享图纸', '.json': 'JSON 项目或色板',
};

function downloadOptions(name, documents) {
  const cleaned = basename(String(name).replace(/\\/g, '/')).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/g, '');
  const extension = extname(cleaned).toLowerCase();
  if (!DOWNLOAD_FORMATS[extension]) return null;
  let filename = cleaned.slice(0, Math.min(cleaned.length - extension.length, 150)) + extension;
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(filename)) filename = '_' + filename;
  return {
    title: '保存豆图导出文件',
    defaultPath: require('node:path').join(documents, filename),
    buttonLabel: '保存',
    filters: [{ name: DOWNLOAD_FORMATS[extension], extensions: [extension.slice(1)] }],
    properties: ['showOverwriteConfirmation', 'createDirectory'],
  };
}

module.exports = { isAppDocument, isLocalResource, isSafeExternalUrl, downloadOptions };
