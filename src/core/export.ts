import { getStats } from "./pattern";
import { patternCanvas } from "./render";
import type { Pattern } from "./types";
import { createShareHTML } from "./share";
import { createSinglePagePDF } from "./single-page-pdf";
import { materialsCSV } from "./materials";
export function exportMaterialsCSV(pattern: Pattern) {
  downloadBlob(new Blob(["\uFEFF", materialsCSV(pattern)], { type: "text/csv;charset=utf-8" }), `${filename(pattern.name)}-用量清单.csv`);
}
export function filename(name: string) {
  return name.replace(/[\\/:*?"<>|]/g, "_").slice(0, 80) || "我的拼豆";
}
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export function downloadJSON(data: unknown, name: string) {
  downloadBlob(
    new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json;charset=utf-8",
    }),
    name,
  );
}
export function exportShareHTML(pattern: Pattern) {
  downloadBlob(
    new Blob([createShareHTML(pattern)], { type: "text/html;charset=utf-8" }),
    `${filename(pattern.name)}-分享图纸.html`,
  );
}
export async function downloadPNG(canvas: HTMLCanvasElement, name: string) {
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("PNG 生成失败。"))),
      "image/png",
    ),
  );
  downloadBlob(blob, name);
}
function text(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  size = 24,
  color = "#233b43",
  weight = 400,
) {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px "Microsoft YaHei","PingFang SC",sans-serif`;
  ctx.fillText(value, x, y);
}
function legend(
  ctx: CanvasRenderingContext2D,
  p: Pattern,
  x: number,
  y: number,
  colWidth: number,
  columns: number,
  cellHeight: number,
  start = 0,
  end = Infinity,
) {
  const used = getStats(p).used.slice(start, end);
  used.forEach((c, i) => {
    const left = x + (i % columns) * colWidth,
      top = y + Math.floor(i / columns) * cellHeight;
    ctx.fillStyle = c.hex;
    ctx.fillRect(left, top, 24, 24);
    ctx.strokeStyle = "#d5dcdf";
    ctx.strokeRect(left, top, 24, 24);
    text(ctx, c.code, left + 36, top + 19, 19);
    text(
      ctx,
      `${c.count.toLocaleString()} 颗`,
      left + colWidth - 140,
      top + 19,
      19,
    );
  });
}
export function exportPatternPNG(p: Pattern) {
  return downloadPNG(
    patternCanvas(p, {
      cellSize: 12,
      grid: false,
      codes: false,
      coordinates: false,
      transparent: true,
    }),
    `${filename(p.name)}-纯图案.png`,
  );
}
export function exportChartPNG(p: Pattern) {
  // Check before allocating the large grid canvas (512² at 24px is 151 MP).
  const expectedWidth = Math.max(900, Math.ceil(p.width * 24 + 86.4) + 80);
  const expectedHeight =
    Math.ceil(p.height * 24 + 86.4) +
    225 +
    Math.ceil(getStats(p).colorCount / 4) * 42;
  if (expectedWidth * expectedHeight > 40_000_000)
    throw new Error("带统计图纸过大，请改用分页 PDF；纯图案 PNG 仍可导出。");
  const stats = getStats(p),
    cellSize = 24,
    grid = patternCanvas(p, {
      cellSize,
      grid: true,
      codes: true,
      coordinates: true,
    });
  const width = Math.max(900, grid.width + 80),
    height = grid.height + 225 + Math.ceil(stats.colorCount / 4) * 42;
  if (width * height > 40_000_000)
    throw new Error("带统计图纸过大，请改用分页 PDF。");
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, width, height);
  text(ctx, `${p.name} · 拼豆图纸`, 40, 54, 32, "#213d42", 600);
  text(
    ctx,
    `${p.width} × ${p.height} 格   /   ${stats.total.toLocaleString()} 颗   /   ${stats.colorCount} 色`,
    40,
    91,
    21,
  );
  ctx.drawImage(grid, (width - grid.width) / 2, 120);
  text(
    ctx,
    `用量清单 · ${p.palette.name}`,
    40,
    grid.height + 164,
    23,
    "#213d42",
    600,
  );
  legend(ctx, p, 40, grid.height + 188, (width - 80) / 4, 4, 42);
  return downloadPNG(canvas, `${filename(p.name)}-制作图纸.png`);
}
export function pdfLayout(p: Pattern, beadMm: number) {
  const cols = Math.floor(180 / beadMm),
    rows = Math.floor(230 / beadMm);
  const across = Math.ceil(p.width / cols),
    down = Math.ceil(p.height / rows),
    legendPages = Math.max(1, Math.ceil(getStats(p).colorCount / 60));
  return {
    cols,
    rows,
    across,
    down,
    legendPages,
    totalPages: legendPages + across * down,
  };
}
export async function exportPDF(
  p: Pattern,
  beadMm: number,
  onProgress: (n: number) => void,
  mode: "single" | "a4" = "single",
) {
  if (mode === "single") {
    downloadBlob(await createSinglePagePDF(p, onProgress), `${filename(p.name)}-单页图纸.pdf`);
    return;
  }
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });
  const layout = pdfLayout(p, beadMm),
    stats = getStats(p);
  let page = 0;
  const put = async (canvas: HTMLCanvasElement) => {
    if (page > 0) pdf.addPage();
    pdf.addImage(
      canvas.toDataURL("image/png"),
      "PNG",
      0,
      0,
      210,
      297,
      undefined,
      "FAST",
    );
    page++;
    onProgress(Math.round((page / layout.totalPages) * 100));
    await new Promise((r) => setTimeout(r, 0));
  };
  for (let l = 0; l < layout.legendPages; l++) {
    const canvas = document.createElement("canvas");
    canvas.width = 1260;
    canvas.height = 1782;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 1260, 1782);
    text(ctx, p.name, 72, 96, 42, "#213d42", 600);
    text(
      ctx,
      `${p.width} × ${p.height} 格  ·  ${stats.total.toLocaleString()} 颗  ·  ${stats.colorCount} 色`,
      72,
      144,
      27,
    );
    text(
      ctx,
      `${p.palette.name} · 用量清单 ${l + 1}/${layout.legendPages}`,
      72,
      205,
      28,
      "#213d42",
      600,
    );
    const thumb = patternCanvas(p, {
      cellSize: 1,
      grid: false,
      codes: false,
      coordinates: false,
    });
    const thumbScale = Math.min(5, 360 / Math.max(p.width, p.height));
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(thumb, 830, 220, p.width * thumbScale, p.height * thumbScale);
    legend(ctx, p, 72, 240, 360, 2, 43, l * 60, (l + 1) * 60);
    text(
      ctx,
      `拼接顺序：${layout.across} 列 × ${layout.down} 行（从左到右、从上到下）`,
      72,
      1570,
      23,
    );
    text(
      ctx,
      `每格 ${beadMm} mm；打印选择「实际大小 / 100%」，请勿缩放。`,
      72,
      1610,
      23,
    );
    text(
      ctx,
      `空白格不放拼豆。10 格粗线辅助数格，页边坐标为整图坐标。`,
      72,
      1650,
      23,
    );
    text(
      ctx,
      `豆图 · 清单页   |   ${page + 1} / ${layout.totalPages}`,
      72,
      1730,
      21,
      "#61747d",
    );
    await put(canvas);
  }
  for (let ty = 0; ty < layout.down; ty++)
    for (let tx = 0; tx < layout.across; tx++) {
      const sx = tx * layout.cols,
        sy = ty * layout.rows,
        cols = Math.min(layout.cols, p.width - sx),
        rows = Math.min(layout.rows, p.height - sy);
      const canvas = document.createElement("canvas");
      canvas.width = 1260;
      canvas.height = 1782;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, 1260, 1782);
      text(ctx, p.name, 60, 65, 32, "#213d42", 600);
      text(
        ctx,
        `拼接位置：第 ${ty + 1} 行 / 第 ${tx + 1} 列    ·    第 ${sx + 1}–${sx + cols} 列，第 ${sy + 1}–${sy + rows} 行`,
        60,
        108,
        23,
      );
      const tile = patternCanvas(p, {
        cellSize: beadMm * 6,
        gutter: 22,
        grid: true,
        codes: true,
        coordinates: true,
        startX: sx,
        startY: sy,
        cols,
        rows,
      });
      ctx.drawImage(tile, 68, 155);
      text(
        ctx,
        `上：${ty > 0 ? `第 ${ty} 行` : "整图顶边"}   下：${ty < layout.down - 1 ? `第 ${ty + 2} 行` : "整图底边"}   左：${tx > 0 ? `第 ${tx} 列` : "整图左边"}   右：${tx < layout.across - 1 ? `第 ${tx + 2} 列` : "整图右边"}`,
        60,
        1640,
        22,
      );
      // Physical calibration is generated in PDF units rather than from the screen.
      ctx.fillStyle = "#203c44";
      ctx.fillRect(60, 1680, 60 * 6, 2);
      ctx.fillRect(60, 1670, 2, 22);
      ctx.fillRect(420, 1670, 2, 22);
      text(ctx, "60 mm 校准线", 445, 1690, 21);
      text(
        ctx,
        `实际大小 100% · 每格 ${beadMm} mm   |   ${page + 1} / ${layout.totalPages}`,
        60,
        1740,
        21,
        "#61747d",
      );
      await put(canvas);
    }
  pdf.setProperties({
    title: p.name,
    subject: "拼豆图纸与用量统计",
    creator: "豆图",
  });
  downloadBlob(pdf.output("blob"), `${filename(p.name)}-A4图纸.pdf`);
}
