import { distance, hexToRgb, rgbToOklab } from "./color";
import { getStats } from "./pattern";
import type { Pattern } from "./types";

export function floodFill(pattern: Pattern, start: number, value: string | null): Pattern {
  if (!Number.isInteger(start) || start < 0 || start >= pattern.cells.length) return pattern;
  if (value !== null && !pattern.palette.colors.some((c) => c.code === value)) return pattern;
  const target = pattern.cells[start];
  if (target === value) return pattern;
  const cells = [...pattern.cells];
  const queue = new Int32Array(cells.length);
  let head = 0, tail = 1;
  queue[0] = start;
  cells[start] = value;
  while (head < tail) {
    const p = queue[head++], x = p % pattern.width;
    const visit = (q: number) => {
      if (cells[q] === target) { cells[q] = value; queue[tail++] = q; }
    };
    if (x > 0) visit(p - 1);
    if (x < pattern.width - 1) visit(p + 1);
    if (p >= pattern.width) visit(p - pattern.width);
    if (p < cells.length - pattern.width) visit(p + pattern.width);
  }
  return { ...pattern, cells };
}

// Merge only enclosed, small, same-color components. Transparent boundaries
// and isolated foreground details are kept; the original pattern is never mutated.
export function cleanSpeckles(pattern: Pattern, maxSize: number, protectedCodes: string[] = []): Pattern {
  const source = pattern.cells, cells = [...source];
  const regions = new Int32Array(source.length).fill(-1), queue = new Int32Array(source.length);
  const protectedSet = new Set(protectedCodes);
  const labs = new Map(pattern.palette.colors.map((c) => [c.code, rgbToOklab(hexToRgb(c.hex))]));
  const components: { code: string; count: number; cells: Int32Array | null }[] = [];
  for (let start = 0; start < source.length; start++) {
    const code = source[start];
    if (regions[start] !== -1 || code === null) continue;
    let head = 0, tail = 1, touchesBlank = false;
    const region = components.length;
    regions[start] = region;
    queue[0] = start;
    while (head < tail) {
      const p = queue[head++], x = p % pattern.width;
      const visit = (q: number) => {
        const c = source[q];
        if (c === null) { touchesBlank = true; return; }
        if (c !== code) return;
        if (regions[q] === -1) { regions[q] = region; queue[tail++] = q; }
      };
      if (x === 0 || x === pattern.width - 1 || p < pattern.width || p >= source.length - pattern.width) touchesBlank = true;
      if (x > 0) visit(p - 1);
      if (x < pattern.width - 1) visit(p + 1);
      if (p >= pattern.width) visit(p - pattern.width);
      if (p < source.length - pattern.width) visit(p + pattern.width);
    }
    components.push({ code, count: tail, cells: tail <= maxSize && !touchesBlank && !protectedSet.has(code) ? queue.slice(0, tail) : null });
  }
  for (const component of components) {
    if (!component.cells) continue;
    const neighbours = new Map<string, number>();
    const { code } = component;
    for (const p of component.cells) {
      for (const q of [p - 1, p + 1, p - pattern.width, p + pattern.width]) {
        const neighbour = components[regions[q]];
        // Only merge into a stable region. Two tiny adjacent components must
        // not swap colors or undo one another in the same cleanup pass.
        if (neighbour && neighbour.code !== code && (neighbour.count > maxSize || protectedSet.has(neighbour.code))) neighbours.set(neighbour.code, (neighbours.get(neighbour.code) ?? 0) + 1);
      }
    }
    if (!neighbours.size) continue;
    const winner = [...neighbours].sort((a, b) => b[1] - a[1] || distance(labs.get(code)!, labs.get(a[0])!) - distance(labs.get(code)!, labs.get(b[0])!))[0];
    if (winner[1] < 3) continue;
    for (const p of component.cells) cells[p] = winner[0];
  }
  return { ...pattern, cells };
}

export function mergeRareColors(pattern: Pattern, maxCount: number, protectedCodes: string[] = []): Pattern {
  const { used } = getStats(pattern), protectedSet = new Set(protectedCodes);
  const keep = used.filter((c) => c.count > maxCount || protectedSet.has(c.code));
  if (!keep.length) return pattern;
  const labs = new Map(used.map((c) => [c.code, rgbToOklab(hexToRgb(c.hex))]));
  const replacements = new Map<string, string>();
  for (const c of used) {
    if (c.count > maxCount || protectedSet.has(c.code)) continue;
    let closest: string | undefined, error = 0.09 ** 2;
    for (const k of keep) {
      const d = distance(labs.get(c.code)!, labs.get(k.code)!);
      if (d < error) { error = d; closest = k.code; }
    }
    if (closest) replacements.set(c.code, closest);
  }
  return { ...pattern, cells: pattern.cells.map((c) => c === null ? null : replacements.get(c) ?? c) };
}
