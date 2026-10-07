import { MAX_CELLS, MAX_DIMENSION, type Pattern } from "./types";
import { parsePalette } from "./palette";
export function validateSize(width: number, height: number) {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > MAX_DIMENSION ||
    height > MAX_DIMENSION ||
    width * height > MAX_CELLS
  )
    throw new Error(
      `宽和高需为 1–${MAX_DIMENSION} 的整数，最多 ${MAX_CELLS.toLocaleString()} 格。`,
    );
}
export function actualSize(w: number, h: number, ratio: number, keep: boolean) {
  validateSize(w, h);
  if (!keep) return { width: w, height: h };
  return ratio >= w / h
    ? { width: w, height: Math.max(1, Math.round(w / ratio)) }
    : { width: Math.max(1, Math.round(h * ratio)), height: h };
}
export function getStats(pattern: Pattern) {
  const counts = new Map<string, number>();
  for (const cell of pattern.cells)
    if (cell !== null) counts.set(cell, (counts.get(cell) ?? 0) + 1);
  const used = pattern.palette.colors
    .filter((c) => counts.has(c.code))
    .map((c) => ({ ...c, count: counts.get(c.code)! }))
    .sort((a, b) => b.count - a.count);
  return {
    used,
    total: used.reduce((n, c) => n + c.count, 0),
    colorCount: used.length,
    blank: pattern.cells.length - used.reduce((n, c) => n + c.count, 0),
  };
}
export function replaceColor(
  pattern: Pattern,
  from: string | null,
  to: string | null,
): Pattern {
  return { ...pattern, cells: pattern.cells.map((c) => (c === from ? to : c)) };
}
export function parseProject(raw: unknown): Pattern {
  const p = raw as Partial<Pattern> | null;
  if (
    !p ||
    p.version !== 1 ||
    typeof p.width !== "number" ||
    typeof p.height !== "number"
  )
    throw new Error("这不是受支持的豆图项目（version 应为 1）。");
  validateSize(p.width, p.height);
  const palette = parsePalette(p.palette);
  const codes = new Set(palette.colors.map((c) => c.code));
  if (
    !Array.isArray(p.cells) ||
    p.cells.length !== p.width * p.height ||
    p.cells.some((c) => c !== null && (typeof c !== "string" || !codes.has(c)))
  )
    throw new Error("图纸格子数量不匹配，或引用了色板中不存在的颜色。");
  return {
    version: 1,
    name: typeof p.name === "string" ? p.name.slice(0, 80) : "我的拼豆",
    width: p.width,
    height: p.height,
    cells: p.cells,
    palette,
  };
}
