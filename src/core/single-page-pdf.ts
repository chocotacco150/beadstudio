import { getStats } from "./pattern";
import { textColor } from "./color";
import type { Pattern } from "./types";

export function singlePageLayout(pattern: Pattern) {
  const cellSize = Math.max(12, Math.min(48, 480 / Math.max(pattern.width, pattern.height)));
  const width = Math.max(600, pattern.width * cellSize + 80);
  const columns = Math.max(3, Math.min(8, Math.floor((width - 80) / 160)));
  const rows = Math.ceil(getStats(pattern).colorCount / columns);
  const gridY = 110;
  const legendY = gridY + pattern.height * cellSize + 50;
  return {
    cellSize, width, columns, rows, gridY, legendY,
    gridX: (width - pattern.width * cellSize) / 2,
    height: legendY + rows * 24 + 40,
  };
}

// The grid, color codes, coordinates and counts are vector PDF objects.
// Only the two short Chinese headings use canvases, avoiding a huge grid bitmap.
export async function createSinglePagePDF(pattern: Pattern, onProgress: (value: number) => void) {
  const { jsPDF } = await import("jspdf");
  const layout = singlePageLayout(pattern);
  const stats = getStats(pattern);
  const pdf = new jsPDF({
    unit: "pt", format: [layout.width, layout.height],
    orientation: layout.width > layout.height ? "landscape" : "portrait",
    compress: true, precision: 4,
  });
  function heading(height: number, y: number, draw: (ctx: CanvasRenderingContext2D) => void) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(layout.width * 2);
    canvas.height = height * 2;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(2, 2);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, layout.width, height);
    ctx.fillStyle = "#203840";
    draw(ctx);
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, y, layout.width, height, undefined, "FAST");
    canvas.width = canvas.height = 1;
  }
  heading(90, 0, (ctx) => {
    ctx.font = '600 30px "Microsoft YaHei","PingFang SC",sans-serif';
    ctx.fillText(pattern.name, 40, 43, layout.width - 80);
    ctx.font = '16px "Microsoft YaHei","PingFang SC",sans-serif';
    ctx.fillStyle = "#526c76";
    ctx.fillText(`${pattern.width} × ${pattern.height} 格 · ${stats.total.toLocaleString()} 颗 · ${stats.colorCount} 色 · 空白 ${stats.blank.toLocaleString()} 格`, 40, 75, layout.width - 80);
  });
  const palette = new Map(pattern.palette.colors.map(color => [color.code, color]));
  const { cellSize: size, gridX, gridY } = layout;
  pdf.setFont("courier", "normal");
  for (let row = 0; row < pattern.height; row++) {
    let column = 0;
    // Merge equal-color runs for smaller files while retaining the exact cells.
    while (column < pattern.width) {
      const code = pattern.cells[row * pattern.width + column];
      let end = column + 1;
      while (end < pattern.width && pattern.cells[row * pattern.width + end] === code) end++;
      if (code !== null) {
        const color = palette.get(code)!;
        pdf.setFillColor(color.hex);
        pdf.rect(gridX + column * size, gridY + row * size, (end - column) * size, size, "F");
        pdf.setTextColor(textColor(color.hex));
        const fontSize = Math.min(size * 0.32, size * 0.84 / (code.length * 0.6));
        pdf.setFontSize(fontSize);
        for (let index = column; index < end; index++) {
          pdf.text(code, gridX + (index + 0.5) * size, gridY + (row + 0.5) * size + fontSize * 0.3, { align: "center" });
        }
      }
      column = end;
    }
    if (row % 16 === 0 || row === pattern.height - 1) {
      onProgress(Math.round((row + 1) / pattern.height * 82));
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  for (let column = 0; column <= pattern.width; column++) {
    pdf.setLineWidth(column % 10 === 0 ? 0.65 : 0.2);
    pdf.setDrawColor(column % 10 === 0 ? "#637780" : "#B7C2C6");
    pdf.line(gridX + column * size, gridY, gridX + column * size, gridY + pattern.height * size);
  }
  for (let row = 0; row <= pattern.height; row++) {
    pdf.setLineWidth(row % 10 === 0 ? 0.65 : 0.2);
    pdf.setDrawColor(row % 10 === 0 ? "#637780" : "#B7C2C6");
    pdf.line(gridX, gridY + row * size, gridX + pattern.width * size, gridY + row * size);
  }
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(Math.min(10, size * 0.55));
  pdf.setTextColor("#526C76");
  for (let column = 0; column < pattern.width; column++) {
    if (column === 0 || column === pattern.width - 1 || (column + 1) % 5 === 0) {
      const x = gridX + (column + 0.5) * size;
      pdf.text(String(column + 1), x, gridY - 8, { align: "center" });
      pdf.text(String(column + 1), x, gridY + pattern.height * size + 15, { align: "center" });
    }
  }
  for (let row = 0; row < pattern.height; row++) {
    if (row === 0 || row === pattern.height - 1 || (row + 1) % 5 === 0) {
      const y = gridY + (row + 0.5) * size + 3;
      pdf.text(String(row + 1), gridX - 10, y, { align: "right" });
      pdf.text(String(row + 1), gridX + pattern.width * size + 10, y);
    }
  }
  heading(36, layout.legendY - 35, (ctx) => {
    ctx.font = '600 18px "Microsoft YaHei","PingFang SC",sans-serif';
    ctx.fillText(`用量清单 · ${pattern.palette.name}（数量单位：颗）`, 40, 24, layout.width - 80);
  });
  const columnWidth = (layout.width - 80) / layout.columns;
  for (const [index, color] of stats.used.entries()) {
    const x = 40 + index % layout.columns * columnWidth;
    const y = layout.legendY + Math.floor(index / layout.columns) * 24;
    pdf.setFillColor(color.hex);
    pdf.setDrawColor("#B7C2C6");
    pdf.setLineWidth(0.3);
    pdf.rect(x, y + 2, 14, 14, "FD");
    pdf.setTextColor("#203840");
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(14);
    const count = color.count.toLocaleString("en-US");
    const available = columnWidth - 44 - pdf.getTextWidth(count);
    pdf.setFont("courier", "bold");
    pdf.setFontSize(Math.min(14, available / (color.code.length * 0.6)));
    pdf.text(color.code, x + 22, y + 14);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(14);
    pdf.text(count, x + columnWidth - 12, y + 14, { align: "right" });
  }
  pdf.setProperties({ title: pattern.name, subject: "单页拼豆图纸与完整用量", creator: "豆图" });
  onProgress(100);
  return pdf.output("blob");
}
