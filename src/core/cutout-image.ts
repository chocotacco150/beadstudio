import { composeRGBA, maskBounds, type SubjectMask } from "./mask";
import { downloadPNG, filename } from "./export";
import { loadImage } from "./sampling";

/** Working raster, independent from screen zoom. Preserve source transparency multiplicatively. */
export function maskImageCanvas(image: HTMLImageElement, mask: SubjectMask) {
  const canvas = document.createElement("canvas"); canvas.width = mask.width; canvas.height = mask.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, 0, 0, mask.width, mask.height);
  const original = ctx.getImageData(0, 0, mask.width, mask.height);
  const pixels = ctx.createImageData(mask.width, mask.height);
  pixels.data.set(composeRGBA(original.data, mask));
  ctx.putImageData(pixels, 0, 0);
  return canvas;
}

export function cutoutCanvas(image: HTMLImageElement, mask: SubjectMask, trim: boolean) {
  const canvas = maskImageCanvas(image, mask);
  if (!trim) return canvas;
  const rgba = canvas.getContext("2d")!.getImageData(0, 0, mask.width, mask.height).data;
  const alpha = new Uint8ClampedArray(mask.data.length);
  for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3];
  const bounds = maskBounds({ ...mask, data: alpha }, 1);
  if (!bounds) throw new Error("当前主体为空白，请补回需要保留的部分。");
  // Keep a little working-space margin so contour edges don't touch the bead chart boundary.
  const padding = Math.ceil(Math.max(mask.width, mask.height) * .02);
  const x = Math.max(0, bounds.x - padding), y = Math.max(0, bounds.y - padding);
  const width = Math.min(mask.width - x, bounds.width + (bounds.x - x) + padding);
  const height = Math.min(mask.height - y, bounds.height + (bounds.y - y) + padding);
  const result = document.createElement("canvas"); result.width = width; result.height = height;
  result.getContext("2d")!.drawImage(canvas, x, y, width, height, 0, 0, width, height);
  return result;
}

export async function prepareCutout(image: HTMLImageElement, mask: SubjectMask, trim: boolean) {
  const canvas = cutoutCanvas(image, mask, trim);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => b ? resolve(b) : reject(new Error("无法生成抠图图片。")), "image/png"));
  const src = URL.createObjectURL(blob);
  try { return { src, image: await loadImage(src) }; }
  catch (error) { URL.revokeObjectURL(src); throw error; }
}

export async function exportCutoutPNG(image: HTMLImageElement, mask: SubjectMask, name: string, trim: boolean) {
  await downloadPNG(cutoutCanvas(image, mask, trim), `${filename(name)}-透明主体.png`);
}
