import type { SubjectMask } from "./mask";
import { segmentationInput } from "./segmentation-data";

export interface SegmentationProgress { percent: number; label: string }
export type CutoutModel = "fast" | "quality";

/** Each inference owns its worker. Cancel terminates both loading and CPU inference. */
export async function segmentImage(image: HTMLImageElement, options: {
  model: CutoutModel; onProgress: (p: SegmentationProgress) => void; signal: AbortSignal;
}): Promise<SubjectMask> {
  const { signal, onProgress } = options;
  signal.throwIfAborted();
  if (!image.naturalWidth || !image.naturalHeight) throw new Error("请先上传有效图片。");
  onProgress({ percent: 1, label: "正在准备照片…" });
  const inputCanvas = document.createElement("canvas");
  inputCanvas.width = inputCanvas.height = 320;
  const context = inputCanvas.getContext("2d", { willReadFrequently: true })!;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, 320, 320);
  const input = segmentationInput(context.getImageData(0, 0, 320, 320).data, 320, 320);
  const output = await new Promise<Uint8ClampedArray>((resolve, reject) => {
    const worker = new Worker(new URL("../workers/segmentation.worker.ts", import.meta.url), { type: "module" });
    const cleanup = () => { clearTimeout(timeout); signal.removeEventListener("abort", abort); worker.terminate(); };
    const abort = () => { cleanup(); reject(new DOMException("已取消主体识别。", "AbortError")); };
    const timeout = setTimeout(() => { cleanup(); reject(new Error("主体识别耗时过长。请尝试快速模式，或关闭其他占用内存的程序后重试。")); }, 240_000);
    signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = ({ data }) => {
      if (data.type === "progress") onProgress({ percent: data.percent, label: data.label });
      else if (data.type === "result") { cleanup(); resolve(data.alpha); }
      else if (data.type === "error") { cleanup(); reject(new Error(data.message)); }
    };
    worker.onerror = () => { cleanup(); reject(new Error("抠图引擎启动失败。请完整解压运行包，并使用新版 Chrome 或 Edge 打开本地地址。")); };
    worker.postMessage({ input, model: options.model, base: new URL(import.meta.env.BASE_URL, location.href).href }, [input.buffer]);
    if (signal.aborted) abort();
  });
  signal.throwIfAborted();
  onProgress({ percent: 94, label: "正在生成可编辑的主体蒙版…" });
  const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale)), height = Math.max(1, Math.round(image.naturalHeight * scale));
  const small = document.createElement("canvas"); small.width = small.height = 320;
  const rgba = new Uint8ClampedArray(320 * 320 * 4);
  for (let i = 0; i < output.length; i++) { rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = output[i]; rgba[i * 4 + 3] = 255; }
  small.getContext("2d")!.putImageData(new ImageData(rgba, 320, 320), 0, 0);
  const full = document.createElement("canvas"); full.width = width; full.height = height;
  const ctx = full.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high"; ctx.drawImage(small, 0, 0, width, height);
  const pixels = ctx.getImageData(0, 0, width, height).data, data = new Uint8ClampedArray(width * height);
  for (let i = 0; i < data.length; i++) data[i] = pixels[i * 4];
  onProgress({ percent: 100, label: "主体识别完成，请检查边缘和细节。" });
  return { width, height, data };
}
