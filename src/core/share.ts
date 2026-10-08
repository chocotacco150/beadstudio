import { getStats, parseProject } from "./pattern";
import { createPatternRenderer } from "./render";
import { textColor } from "./color";
import { initializeShareViewer } from "../share/viewer";
import styles from "../share/viewer.css?raw";
import type { Pattern } from "./types";

function htmlText(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}
// Never allow a project name/color name to terminate a script element.
function scriptJSON(value: unknown) {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`);
}
export function createShareHTML(pattern: Pattern) {
  const snapshot = parseProject(pattern);
  const script = `(() => {
    const pattern = JSON.parse(document.getElementById("pattern-data").textContent);
    const renderer = (${createPatternRenderer.toString()})(${textColor.toString()});
    (${initializeShareViewer.toString()})(pattern, renderer, ${getStats.toString()});
  })();`.replace(/<\/script/gi, "<\\/script");
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; base-uri 'none'; form-action 'none'">
<title>${htmlText(snapshot.name)} · 拼豆图纸</title>
<style>${styles}</style>
</head>
<body>
<header>
  <div class="heading"><div class="brand">豆图 · 拼豆图纸</div><h1 id="pattern-name">${htmlText(snapshot.name)}</h1><p id="pattern-meta"></p></div>
  <button id="save-project" type="button">保存项目 JSON</button>
</header>
<main class="workspace">
  <section class="chart-panel" aria-label="拼豆图纸预览">
    <div class="toolbar">
      <div class="zoom-controls"><button id="zoom-out" type="button" aria-label="缩小图纸">−</button><span id="zoom-label" title="画布缩放">100%</span><button id="zoom-in" type="button" aria-label="放大图纸">＋</button><button id="fit" type="button">适应画布</button></div>
      <div class="display-controls"><label><input id="grid" type="checkbox" checked>网格</label><label><input id="codes" type="checkbox" checked>色号</label><label><input id="coordinates" type="checkbox" checked>坐标</label></div>
    </div>
    <div id="canvas-host"><canvas id="chart" tabindex="0" aria-label="图纸画布；滚轮缩放、拖动移动，也可用加减号缩放、方向键移动、数字零适应画布"></canvas></div>
    <p id="cell-status">滚轮缩放 · 拖动移动 · 放大查看色号</p>
  </section>
  <aside class="legend-panel" aria-label="全部色号与拼豆用量">
    <div class="legend-heading"><div class="legend-title"><h2>本图纸所需色号</h2><span id="required-count"></span></div><p id="palette-name"></p></div>
    <dl class="summary"><div><dt>总拼豆数量</dt><dd id="total-count"></dd></div><div><dt>空白格</dt><dd id="blank-count"></dd></div></dl>
    <div class="legend-tools"><span>点击色号高亮对应格子</span><button id="clear-highlight" type="button" disabled>取消高亮</button></div>
    <div id="legend" role="region" aria-label="所需色号和数量清单" tabindex="0"></div>
    <p class="note" id="palette-description"></p>
    <p class="note">此文件可离线查看。想继续编辑，保存项目 JSON 后在豆图工具中加载。</p>
  </aside>
</main>
<noscript>请使用支持 JavaScript 的浏览器打开此图纸，例如 Chrome 或 Edge。</noscript>
<script id="pattern-data" type="application/json">${scriptJSON(snapshot)}</script>
<script>${script}</script>
</body>
</html>`;
}
