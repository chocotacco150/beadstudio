'use strict';

const { ipcRenderer } = require('electron');

// No Node or IPC API is exposed to application JavaScript. Only trusted DOM
// anchor activations in this isolated preload can request the external browser.
function handleLink(event) {
  if (!event.isTrusted || event.defaultPrevented || (event.button !== 0 && event.button !== 1)) return;
  const anchor = event.composedPath().find(node => node instanceof HTMLAnchorElement);
  if (!anchor || anchor.hasAttribute('download')) return;
  let url;
  try { url = new URL(anchor.href); } catch { return; }
  if (url.origin === location.origin) return;
  event.preventDefault();
  if (url.protocol === 'https:') ipcRenderer.send('bead:open-external', url.href);
}
window.addEventListener('click', handleLink, { capture: true });
window.addEventListener('auxclick', handleLink, { capture: true });
