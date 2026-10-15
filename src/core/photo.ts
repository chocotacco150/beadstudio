import { distance, hexToRgb, rgbToOklab } from "./color";
import type { ConvertSettings } from "./types";

export interface PhotoInput {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  scale: number;
  settings: ConvertSettings;
}

// Only remove colors connected to the edge. Enclosed areas of the same color
// stay intact. This is intentionally a plain-background tool, not AI segmentation.
export function removeEdgeBackground(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  tolerance: number,
) {
  const bins = new Map<
    number,
    { count: number; r: number; g: number; b: number }
  >();
  const border: number[] = [];
  for (let x = 0; x < width; x++) {
    border.push(x);
    if (height > 1) border.push((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y++) {
    border.push(y * width);
    if (width > 1) border.push(y * width + width - 1);
  }
  for (const p of border) {
    const i = p * 4;
    if (data[i + 3] < 128) continue;
    const key =
      ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
    const bin = bins.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
    bin.count++;
    bin.r += data[i];
    bin.g += data[i + 1];
    bin.b += data[i + 2];
    bins.set(key, bin);
  }
  const dominant = [...bins.values()].sort((a, b) => b.count - a.count)[0];
  if (!dominant) return;
  const background = rgbToOklab([
    dominant.r / dominant.count,
    dominant.g / dominant.count,
    dominant.b / dominant.count,
  ]);
  const threshold = (tolerance / 100) ** 2;
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0,
    tail = 0;
  const similar = new Map<number, boolean>();
  const visit = (p: number) => {
    if (visited[p]) return;
    visited[p] = 1;
    const i = p * 4;
    if (data[i + 3] >= 128) {
      const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
      let match = similar.get(key);
      if (match === undefined) {
        match =
          distance(
            rgbToOklab([data[i], data[i + 1], data[i + 2]]),
            background,
          ) <= threshold;
        similar.set(key, match);
      }
      if (!match) return;
    }
    data[i + 3] = 0;
    queue[tail++] = p;
  };
  for (const p of border) visit(p);
  while (head < tail) {
    const p = queue[head++],
      x = p % width;
    if (x > 0) visit(p - 1);
    if (x < width - 1) visit(p + 1);
    if (p >= width) visit(p - width);
    if (p < width * (height - 1)) visit(p + width);
  }
}

export function preparePhoto(
  input: PhotoInput,
  progress: (n: number) => void = () => {},
) {
  const { data, width, height, scale, settings } = input;
  if (settings.removeBackground)
    removeEdgeBackground(
      data,
      width * scale,
      height * scale,
      settings.backgroundTolerance,
    );
  progress(8);
  // Average a 3×3 region per bead in photo mode, alpha-weighted to avoid dark
  // halos around transparent edges. Pixel mode samples with nearest neighbour.
  const output = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let a = 0,
        r = 0,
        g = 0,
        b = 0;
      for (let dy = 0; dy < scale; dy++)
        for (let dx = 0; dx < scale; dx++) {
          const i = ((y * scale + dy) * width * scale + x * scale + dx) * 4;
          const alpha = data[i + 3];
          a += alpha;
          r += data[i] * alpha;
          g += data[i + 1] * alpha;
          b += data[i + 2] * alpha;
        }
      const p = (y * width + x) * 4;
      if (a) {
        output[p] = r / a;
        output[p + 1] = g / a;
        output[p + 2] = b / a;
      }
      output[p + 3] = a / (scale * scale);
    }
  }
  progress(14);
  if (settings.mode !== "pixel" && settings.smoothing > 0) {
    // Edge-aware local averaging suppresses texture speckles while preserving
    // sharp subject boundaries. Two passes are useful for busy backgrounds.
    for (let pass = 0; pass < settings.smoothing; pass++) {
      const source = output.slice();
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          const p = (y * width + x) * 4;
          if (source[p + 3] < 128) continue;
          let weight = 4,
            r = source[p] * 4,
            g = source[p + 1] * 4,
            b = source[p + 2] * 4;
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              const nx = x + dx,
                ny = y + dy;
              if (
                (!dx && !dy) ||
                nx < 0 ||
                ny < 0 ||
                nx >= width ||
                ny >= height
              )
                continue;
              const q = (ny * width + nx) * 4;
              if (source[q + 3] < 128) continue;
              const difference =
                (source[p] - source[q]) ** 2 +
                (source[p + 1] - source[q + 1]) ** 2 +
                (source[p + 2] - source[q + 2]) ** 2;
              const w = Math.exp(-difference / 2400) * (!dx || !dy ? 1 : 0.7);
              weight += w;
              r += source[q] * w;
              g += source[q + 1] * w;
              b += source[q + 2] * w;
            }
          output[p] = r / weight;
          output[p + 1] = g / weight;
          output[p + 2] = b / weight;
        }
    }
  }
  const fill = settings.background ? hexToRgb(settings.background) : null;
  const contrast = settings.mode !== "pixel" ? 1 + settings.contrast / 100 : 1;
  const brightness = settings.mode !== "pixel" ? (settings.brightness ?? 0) * 2.55 : 0;
  const saturation = settings.mode !== "pixel" ? (settings.saturation ?? 100) / 100 : 1;
  for (let i = 0; i < output.length; i += 4) {
    const luminance = output[i] * 0.2126 + output[i + 1] * 0.7152 + output[i + 2] * 0.0722;
    for (let c = 0; c < 3; c++)
      output[i + c] = (luminance + (output[i + c] - luminance) * saturation - 128) * contrast + 128 + brightness;
    if (fill) {
      const a = output[i + 3] / 255;
      for (let c = 0; c < 3; c++)
        output[i + c] = output[i + c] * a + fill[c] * (1 - a);
      output[i + 3] = 255;
    }
  }
  if (settings.mode === "lineart") {
    // Otsu's threshold adapts to paper brightness. Transparent cells do not
    // contribute to the histogram or become beads.
    const histogram = new Uint32Array(256);
    let count = 0, sum = 0;
    for (let i = 0; i < output.length; i += 4) {
      if (output[i + 3] < 128) continue;
      const v = Math.round(output[i] * .2126 + output[i + 1] * .7152 + output[i + 2] * .0722);
      histogram[v]++; count++; sum += v;
    }
    let leftCount = 0, leftSum = 0, best = -1, threshold = 127;
    for (let t = 0; t < 255; t++) {
      leftCount += histogram[t]; leftSum += histogram[t] * t;
      const rightCount = count - leftCount;
      if (!leftCount || !rightCount) continue;
      const variance = leftCount * rightCount * (leftSum / leftCount - (sum - leftSum) / rightCount) ** 2;
      if (variance > best) { best = variance; threshold = t; }
    }
    for (let i = 0; i < output.length; i += 4) {
      const value = output[i] * .2126 + output[i + 1] * .7152 + output[i + 2] * .0722 <= threshold ? 0 : 255;
      output[i] = output[i + 1] = output[i + 2] = value;
    }
  }
  progress(20);
  return output;
}
