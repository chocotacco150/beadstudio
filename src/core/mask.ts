/** A subject matte in working-image pixels: 0 is background and 255 is foreground. */
export type SubjectMask = { width: number; height: number; data: Uint8ClampedArray };
export type MaskPoint = { x: number; y: number };
export type MaskBounds = { x: number; y: number; width: number; height: number };

const MAX_MASK_DIMENSION = 2048;

function validateMask(mask: SubjectMask): number {
  if (!mask || !Number.isInteger(mask.width) || !Number.isInteger(mask.height)
    || mask.width < 1 || mask.height < 1 || mask.width > MAX_MASK_DIMENSION || mask.height > MAX_MASK_DIMENSION
    || !(mask.data instanceof Uint8ClampedArray) || mask.data.length !== mask.width * mask.height) {
    throw new Error("主体蒙版无效：宽高必须为 1–2048 的整数，透明度数据必须与尺寸一致。");
  }
  return mask.width * mask.height;
}

function validateRange(value: number, min: number, max: number, label: string): void {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${label}必须为 ${min}–${max} 之间的有限数值。`);
  }
}

function validatePoint(point: MaskPoint): void {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)
    || Math.abs(point.x) > 1e7 || Math.abs(point.y) > 1e7) {
    throw new Error("蒙版坐标无效，请使用图像像素坐标。");
  }
}

function withData(mask: SubjectMask, data: Uint8ClampedArray): SubjectMask {
  return { width: mask.width, height: mask.height, data };
}

function foreground(alpha: number, threshold: number): boolean {
  // Alpha zero remains background even at threshold zero.
  return alpha > 0 && alpha >= threshold;
}

/** Sliding-window extrema. A square radius r costs O(width × height), not O(r²). */
function morphology(input: Uint8ClampedArray, width: number, height: number, radius: number, grow: boolean): Uint8ClampedArray {
  const horizontal = new Uint8ClampedArray(input.length);
  const output = new Uint8ClampedArray(input.length);
  const queue = new Int32Array(Math.max(width, height));
  const pass = (source: Uint8ClampedArray, target: Uint8ClampedArray, length: number, lines: number, vertical: boolean) => {
    for (let line = 0; line < lines; line++) {
      let head = 0, tail = 0, next = 0;
      const index = (position: number) => vertical ? position * width + line : line * width + position;
      for (let position = 0; position < length; position++) {
        const right = Math.min(length - 1, position + radius);
        while (next <= right) {
          const value = source[index(next)];
          while (tail > head && (grow ? source[index(queue[tail - 1])] <= value : source[index(queue[tail - 1])] >= value)) tail--;
          queue[tail++] = next++;
        }
        while (head < tail && queue[head] < position - radius) head++;
        // The image is surrounded by transparent pixels, so erosion also removes outer edges.
        target[index(position)] = !grow && (position < radius || position + radius >= length)
          ? 0 : source[index(queue[head])];
      }
    }
  };
  pass(input, horizontal, width, height, false);
  pass(horizontal, output, height, width, true);
  return output;
}

/** Separable box feather with transparent outside-image samples. */
function featherMask(input: Uint8ClampedArray, width: number, height: number, radius: number): Uint8ClampedArray {
  const horizontal = new Float32Array(input.length);
  const output = new Uint8ClampedArray(input.length);
  const divisor = radius * 2 + 1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let sum = 0;
    for (let x = 0; x <= Math.min(radius, width - 1); x++) sum += input[row + x];
    for (let x = 0; x < width; x++) {
      horizontal[row + x] = sum / divisor;
      if (x - radius >= 0) sum -= input[row + x - radius];
      if (x + radius + 1 < width) sum += input[row + x + radius + 1];
    }
  }
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let y = 0; y <= Math.min(radius, height - 1); y++) sum += horizontal[y * width + x];
    for (let y = 0; y < height; y++) {
      output[y * width + x] = Math.round(sum / divisor);
      if (y - radius >= 0) sum -= horizontal[(y - radius) * width + x];
      if (y + radius + 1 < height) sum += horizontal[(y + radius + 1) * width + x];
    }
  }
  return output;
}

/**
 * Binarize at threshold, then grow (+offset) / shrink (-offset), then feather.
 * Offset uses a square pixel radius; feather is a spatial box-blur radius in pixels.
 * Radii are rounded to integers. This intentionally creates a fresh matte from the
 * supplied inference result; sliders should always use that result, not the last preview.
 */
export function refineMask(mask: SubjectMask, threshold = 128, feather = 0, offset = 0): SubjectMask {
  const length = validateMask(mask);
  validateRange(threshold, 0, 255, "主体阈值");
  validateRange(feather, 0, 32, "边缘羽化");
  validateRange(offset, -10, 10, "边缘扩缩");
  let data: Uint8ClampedArray = new Uint8ClampedArray(length);
  for (let i = 0; i < length; i++) data[i] = foreground(mask.data[i], threshold) ? 255 : 0;
  const offsetRadius = Math.round(Math.abs(offset));
  if (offsetRadius) data = morphology(data, mask.width, mask.height, offsetRadius, offset > 0);
  const featherRadius = Math.round(feather);
  if (featherRadius) data = featherMask(data, mask.width, mask.height, featherRadius);
  return withData(mask, data);
}

/**
 * Paint an immutable continuous stroke. Coordinates refer to image edges; each
 * pixel is tested at its center (x + 0.5, y + 0.5). Adjacent points form capsules,
 * so fast mouse movements do not leave gaps. Values are hard keep/remove alpha.
 */
export function paintMask(mask: SubjectMask, points: MaskPoint[], radius: number, value: 0 | 255): SubjectMask {
  validateMask(mask);
  if (!Number.isFinite(radius) || radius <= 0 || radius > MAX_MASK_DIMENSION) throw new Error("修整画笔半径必须大于 0，且不超过 2048 像素。");
  if (value !== 0 && value !== 255) throw new Error("修整画笔只能使用保留或擦除模式。");
  if (!Array.isArray(points)) throw new Error("修整笔迹数据无效。");
  points.forEach(validatePoint);
  const data = new Uint8ClampedArray(mask.data);
  const { width, height } = mask;
  for (let step = 0; step < points.length; step++) {
    const from = points[Math.max(0, step - 1)], to = points[step];
    const dx = to.x - from.x, dy = to.y - from.y, distanceSquared = dx * dx + dy * dy;
    const left = Math.max(0, Math.ceil(Math.min(from.x, to.x) - radius - 0.5));
    const right = Math.min(width - 1, Math.floor(Math.max(from.x, to.x) + radius - 0.5));
    const top = Math.max(0, Math.ceil(Math.min(from.y, to.y) - radius - 0.5));
    const bottom = Math.min(height - 1, Math.floor(Math.max(from.y, to.y) + radius - 0.5));
    for (let y = top; y <= bottom; y++) {
      for (let x = left; x <= right; x++) {
        const px = x + 0.5, py = y + 0.5;
        const t = distanceSquared ? Math.max(0, Math.min(1, ((px - from.x) * dx + (py - from.y) * dy) / distanceSquared)) : 0;
        const deltaX = px - from.x - t * dx, deltaY = py - from.y - t * dy;
        if (deltaX * deltaX + deltaY * deltaY <= radius * radius) data[y * width + x] = value;
      }
    }
  }
  return withData(mask, data);
}

/** Tight bounds of nonzero alpha at or above threshold, in working-image pixels. */
export function maskBounds(mask: SubjectMask, threshold = 128): MaskBounds | null {
  validateMask(mask);
  validateRange(threshold, 0, 255, "主体阈值");
  let left = mask.width, right = -1, top = mask.height, bottom = -1;
  for (let y = 0; y < mask.height; y++) {
    for (let x = 0; x < mask.width; x++) {
      if (foreground(mask.data[y * mask.width + x], threshold)) {
        left = Math.min(left, x); right = Math.max(right, x);
        top = Math.min(top, y); bottom = y;
      }
    }
  }
  return right < left ? null : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

/**
 * Retain the clicked 4-connected solid subject and its soft fringe. Soft pixels
 * are assigned to their nearest solid pixel through positive-alpha neighbors;
 * ties between selected and discarded subjects are removed. This prevents a
 * faint soft bridge from pulling an unrelated second subject into the result.
 * A click outside the image or below threshold leaves a new, unchanged copy.
 */
export function keepMaskComponent(mask: SubjectMask, point: MaskPoint, threshold = 128): SubjectMask {
  const length = validateMask(mask);
  validatePoint(point);
  validateRange(threshold, 0, 255, "主体阈值");
  const { width, height } = mask;
  const x = Math.floor(point.x), y = Math.floor(point.y);
  if (x < 0 || x >= width || y < 0 || y >= height || !foreground(mask.data[y * width + x], threshold)) {
    return withData(mask, new Uint8ClampedArray(mask.data));
  }
  const owners = new Uint8Array(length);
  const queue = new Int32Array(length);
  let head = 0, tail = 0;
  const start = y * width + x;
  owners[start] = 1;
  queue[tail++] = start;
  const neighbors = (i: number, visit: (index: number) => void) => {
    if (i % width > 0) visit(i - 1);
    if (i % width + 1 < width) visit(i + 1);
    if (i >= width) visit(i - width);
    if (i + width < length) visit(i + width);
  };
  while (head < tail) {
    neighbors(queue[head++], (next) => {
      if (!owners[next] && foreground(mask.data[next], threshold)) {
        owners[next] = 1;
        queue[tail++] = next;
      }
    });
  }
  if (tail === length) return withData(mask, new Uint8ClampedArray(mask.data));
  // All solid pixels are simultaneous seeds, so only the closest subject owns a soft pixel.
  const distances = new Uint32Array(length);
  const unvisited = 0xffffffff;
  distances.fill(unvisited);
  head = 0; tail = 0;
  for (let i = 0; i < length; i++) {
    if (foreground(mask.data[i], threshold)) {
      if (!owners[i]) owners[i] = 2;
      distances[i] = 0;
      queue[tail++] = i;
    }
  }
  while (head < tail) {
    const current = queue[head++], nextDistance = distances[current] + 1;
    neighbors(current, (next) => {
      if (!mask.data[next]) return;
      if (distances[next] === unvisited) {
        distances[next] = nextDistance;
        owners[next] = owners[current];
        queue[tail++] = next;
      } else if (distances[next] === nextDistance) {
        owners[next] |= owners[current];
      }
    });
  }
  const data = new Uint8ClampedArray(length);
  for (let i = 0; i < length; i++) if (owners[i] === 1) data[i] = mask.data[i];
  return withData(mask, data);
}

/** Alpha-weighted fraction of the image kept, in the range 0–1. */
export function maskCoverage(mask: SubjectMask): number {
  const length = validateMask(mask);
  let total = 0;
  for (let i = 0; i < length; i++) total += mask.data[i];
  return total / (255 * length);
}

/** Apply a same-size mask without changing RGB or resurrecting source transparency. */
export function composeRGBA(source: Uint8ClampedArray, mask: SubjectMask): Uint8ClampedArray {
  const length = validateMask(mask);
  if (!(source instanceof Uint8ClampedArray) || source.length !== length * 4) throw new Error("原图像素与主体蒙版的尺寸不一致。");
  const output = new Uint8ClampedArray(source);
  for (let i = 0; i < length; i++) output[i * 4 + 3] = Math.round(source[i * 4 + 3] * mask.data[i] / 255);
  return output;
}
