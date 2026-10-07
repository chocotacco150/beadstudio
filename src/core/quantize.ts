import { distance, hexToRgb, rgbToOklab, type Triple } from "./color";
import type { PaletteColor } from "./types";
export interface QuantizeInput {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  colors: PaletteColor[];
  maxColors: number;
  dither: boolean;
  precise?: boolean;
}
export function quantize(
  input: QuantizeInput,
  progress: (n: number) => void = () => {},
) {
  const { data, width, height, colors, dither } = input;
  const labs = colors.map((c) => rgbToOklab(hexToRgb(c.hex)));
  const rgbs = colors.map((c) => hexToRgb(c.hex));
  const nearest = (lab: Triple, candidates: number[]) => {
    let best = candidates[0],
      error = Infinity;
    for (const i of candidates) {
      const d = distance(lab, labs[i]);
      if (d < error) {
        error = d;
        best = i;
      }
    }
    return best;
  };
  const all = colors.map((_, i) => i);
  const histogram = new Map<number, number>();
  // A bounded 5-bit/channel histogram makes photographic texture independent
  // of the source photo's megapixel count. Use actual bin means, not RGB cubes.
  const keyAt = (p: number) =>
    input.precise
      ? (data[p] << 16) | (data[p + 1] << 8) | data[p + 2]
      : ((data[p] >> 3) << 10) | ((data[p + 1] >> 3) << 5) | (data[p + 2] >> 3);
  const bins = new Map<
    number,
    {
      r: number;
      g: number;
      b: number;
      count: number;
      lab?: Triple;
      match?: number;
    }
  >();
  for (let p = 0; p < data.length; p += 4) {
    if (data[p + 3] < 128) continue;
    const key = keyAt(p);
    const bin = bins.get(key) ?? { r: 0, g: 0, b: 0, count: 0 };
    bin.r += data[p];
    bin.g += data[p + 1];
    bin.b += data[p + 2];
    bin.count++;
    bins.set(key, bin);
  }
  for (const bin of bins.values()) {
    bin.lab = rgbToOklab([
      bin.r / bin.count,
      bin.g / bin.count,
      bin.b / bin.count,
    ]);
    const match = nearest(bin.lab, all);
    histogram.set(match, (histogram.get(match) ?? 0) + bin.count);
  }
  progress(35);
  // Weighted greedy palette selection minimizes perceptual error on the image histogram.
  const candidates = [...histogram.keys()];
  const limit = Math.min(Math.max(1, input.maxColors), candidates.length);
  const selected: number[] = [];
  const errors = candidates.map(() => Infinity);
  const weights = candidates.map((c) => histogram.get(c)!);
  const pairwise = candidates.map((c) =>
    candidates.map((other) => distance(labs[c], labs[other])),
  );
  while (selected.length < limit) {
    let best = candidates[0],
      bestScore = Infinity;
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      if (selected.includes(c)) continue;
      let score = 0;
      for (let j = 0; j < candidates.length; j++)
        score += Math.min(errors[j], pairwise[i][j]) * weights[j];
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    }
    selected.push(best);
    for (let j = 0; j < candidates.length; j++)
      errors[j] = Math.min(
        errors[j],
        distance(labs[candidates[j]], labs[best]),
      );
  }
  progress(65);
  const cells: (string | null)[] = Array(width * height).fill(null);
  if (!selected.length) {
    progress(100);
    return cells;
  }
  const work = dither ? new Float32Array(width * height * 3) : null;
  if (work)
    for (let p = 0; p < cells.length; p++)
      for (let c = 0; c < 3; c++) work[p * 3 + c] = data[p * 4 + c];
  if (!dither)
    for (const bin of bins.values()) bin.match = nearest(bin.lab!, selected);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      if (data[p * 4 + 3] < 128) continue;
      const rgb: Triple = work
        ? [work[p * 3], work[p * 3 + 1], work[p * 3 + 2]]
        : [data[p * 4], data[p * 4 + 1], data[p * 4 + 2]];
      let index: number;
      if (dither) index = nearest(rgbToOklab(rgb), selected);
      else {
        index = bins.get(keyAt(p * 4))!.match!;
      }
      cells[p] = colors[index].code;
      if (dither)
        for (const [dx, dy, weight] of [
          [1, 0, 7 / 16],
          [-1, 1, 3 / 16],
          [0, 1, 5 / 16],
          [1, 1, 1 / 16],
        ]) {
          const nx = x + dx,
            ny = y + dy,
            q = ny * width + nx;
          if (nx < 0 || nx >= width || ny >= height || data[q * 4 + 3] < 128)
            continue;
          for (let c = 0; c < 3; c++)
            work![q * 3 + c] += (rgb[c] - rgbs[index][c]) * weight;
        }
    }
    if (y % 8 === 0) progress(65 + Math.round((y / height) * 34));
  }
  progress(100);
  return cells;
}
