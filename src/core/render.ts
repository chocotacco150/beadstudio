import { textColor } from "./color";
import type { DisplayOptions, Pattern } from "./types";
export interface RenderOptions extends DisplayOptions {
  cellSize: number;
  gutter?: number;
  startX?: number;
  startY?: number;
  cols?: number;
  rows?: number;
  highlight?: string | null;
  transparent?: boolean;
}
export function drawPattern(
  ctx: CanvasRenderingContext2D,
  p: Pattern,
  o: RenderOptions,
) {
  const { cellSize: s } = o,
    g = o.coordinates ? (o.gutter ?? s * 1.8) : 0;
  const sx = o.startX ?? 0,
    sy = o.startY ?? 0,
    cols = o.cols ?? p.width,
    rows = o.rows ?? p.height;
  const colors = new Map(p.palette.colors.map((c) => [c.code, c]));
  ctx.save();
  ctx.clearRect(0, 0, cols * s + g * 2, rows * s + g * 2);
  if (!o.transparent) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cols * s + g * 2, rows * s + g * 2);
  }
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const code = p.cells[(sy + y) * p.width + sx + x],
        c = code === null ? undefined : colors.get(code);
      if (c) {
        ctx.fillStyle = c.hex;
        ctx.fillRect(g + x * s, g + y * s, s, s);
      }
      if (o.highlight && code !== o.highlight) {
        ctx.fillStyle = "rgba(255,255,255,.82)";
        ctx.fillRect(g + x * s, g + y * s, s, s);
      }
      if (o.codes && c) {
        ctx.fillStyle = textColor(c.hex);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = `500 ${Math.max(3, Math.min(s * 0.32, (s * 0.88) / (c.code.length * 0.6)))}px ui-monospace,Consolas,monospace`;
        ctx.fillText(c.code, g + (x + 0.5) * s, g + (y + 0.5) * s, s * 0.91);
      }
    }
  if (o.grid) {
    for (let x = 0; x <= cols; x++) {
      ctx.beginPath();
      ctx.lineWidth = (x + sx) % 10 === 0 ? 1.6 : 0.45;
      ctx.strokeStyle = (x + sx) % 10 === 0 ? "#4c657580" : "#536b7536";
      ctx.moveTo(g + x * s, g);
      ctx.lineTo(g + x * s, g + rows * s);
      ctx.stroke();
    }
    for (let y = 0; y <= rows; y++) {
      ctx.beginPath();
      ctx.lineWidth = (y + sy) % 10 === 0 ? 1.6 : 0.45;
      ctx.strokeStyle = (y + sy) % 10 === 0 ? "#4c657580" : "#536b7536";
      ctx.moveTo(g, g + y * s);
      ctx.lineTo(g + cols * s, g + y * s);
      ctx.stroke();
    }
  }
  if (o.coordinates) {
    ctx.fillStyle = "#61747d";
    ctx.font = `500 ${Math.min(12, s * 0.48)}px ui-monospace,Consolas,monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let x = 0; x < cols; x++)
      if ((x + sx + 1) % 5 === 0 || x === 0 || x === cols - 1) {
        ctx.fillText(String(x + sx + 1), g + (x + 0.5) * s, g * 0.5);
        ctx.fillText(
          String(x + sx + 1),
          g + (x + 0.5) * s,
          g + rows * s + g * 0.5,
        );
      }
    for (let y = 0; y < rows; y++)
      if ((y + sy + 1) % 5 === 0 || y === 0 || y === rows - 1) {
        ctx.fillText(String(y + sy + 1), g * 0.5, g + (y + 0.5) * s);
        ctx.fillText(
          String(y + sy + 1),
          g + cols * s + g * 0.5,
          g + (y + 0.5) * s,
        );
      }
  }
  ctx.restore();
}
export function patternCanvas(p: Pattern, o: RenderOptions) {
  const g = o.coordinates ? (o.gutter ?? o.cellSize * 1.8) : 0;
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil((o.cols ?? p.width) * o.cellSize + 2 * g);
  canvas.height = Math.ceil((o.rows ?? p.height) * o.cellSize + 2 * g);
  drawPattern(canvas.getContext("2d")!, p, o);
  return canvas;
}
