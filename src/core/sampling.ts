import type { Crop, ConvertSettings, Palette, Pattern } from "./types";
import { actualSize } from "./pattern";
export const fullCrop: Crop = { x: 0, y: 0, width: 1, height: 1 };
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("无法读取图片，请使用有效的 PNG、JPG 或 WebP 文件。"));
    image.src = src;
  });
}
export async function readImageFile(file: File) {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    throw new Error("仅支持 PNG、JPG 和 WebP 图片。");
  if (file.size > 25 * 1024 * 1024)
    throw new Error("图片文件不能超过 25 MB，请先压缩图片。");
  const src = URL.createObjectURL(file);
  try {
    const image = await loadImage(src);
    if (image.naturalWidth * image.naturalHeight > 40_000_000)
      throw new Error("图片不能超过 4000 万像素，请先缩小图片。");
    return { src, image };
  } catch (e) {
    URL.revokeObjectURL(src);
    throw e;
  }
}
export function convertImage(
  image: HTMLImageElement,
  crop: Crop,
  settings: ConvertSettings,
  palette: Palette,
  name: string,
  progress: (n: number) => void,
): Promise<Pattern> {
  const { width, height } = actualSize(
    settings.width,
    settings.height,
    (image.naturalWidth * crop.width) / (image.naturalHeight * crop.height),
    settings.keepRatio,
  );
  const canvas = document.createElement("canvas");
  const scale = settings.mode === "pixel" ? 1 : 3;
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = settings.mode !== "pixel";
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    image,
    crop.x * image.naturalWidth,
    crop.y * image.naturalHeight,
    crop.width * image.naturalWidth,
    crop.height * image.naturalHeight,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  progress(3);
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("../workers/convert.worker.ts", import.meta.url),
      { type: "module" },
    );
    const cleanup = () => {
      clearTimeout(timeout);
      worker.terminate();
    };
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("转换耗时过长，请降低图纸尺寸或色板数量。"));
    }, 60000);
    worker.onmessage = ({ data }) => {
      if (data.type === "progress") progress(data.value);
      if (data.type === "result") {
        cleanup();
        resolve({
          version: 1,
          name,
          width,
          height,
          cells: data.cells,
          palette,
        });
      }
      if (data.type === "error") {
        cleanup();
        reject(new Error(data.message));
      }
    };
    worker.onerror = () => {
      cleanup();
      reject(new Error("图片处理失败，请重新尝试。"));
    };
    worker.postMessage(
      {
        data: pixels.data,
        width,
        height,
        colors: palette.colors,
        maxColors: settings.maxColors,
        dither: settings.dither,
        scale,
        settings,
      },
      [pixels.data.buffer],
    );
  });
}
