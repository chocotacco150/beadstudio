import * as ort from "onnxruntime-web/wasm";
import { segmentationOutput } from "../core/segmentation-data";

const scope = self as unknown as { postMessage: (value: unknown, transfer?: Transferable[]) => void; onmessage: ((event: MessageEvent) => void) | null };
scope.onmessage = async ({ data: { input, model, base } }) => {
  let session: ort.InferenceSession | null = null;
  const progress = (percent: number, label: string) => scope.postMessage({ type: "progress", percent, label });
  try {
    ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;
    ort.env.wasm.wasmPaths = new URL("cutout-runtime/", base).href;
    ort.env.wasm.proxy = false;
    const name = model === "quality" ? "u2net.onnx" : "u2netp.onnx";
    progress(5, "正在读取本地模型…");
    const response = await fetch(new URL(`models/${name}`, base));
    if (!response.ok) throw new Error("找不到抠图模型，请完整解压 v1.3 本地包（含 models 文件夹）。");
    const size = Number(response.headers.get("content-length")) || (model === "quality" ? 176_000_000 : 4_600_000);
    const reader = response.body?.getReader();
    if (!reader) throw new Error("浏览器无法读取本地模型，请更新 Chrome 或 Edge。");
    const chunks: Uint8Array[] = []; let received = 0;
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      chunks.push(value); received += value.length;
      progress(Math.min(35, 5 + Math.round(received / size * 30)), `正在读取本地模型 ${Math.round(received / 1024 / 1024)} MB…`);
    }
    if (received < 1_000_000) throw new Error("抠图模型缺失或不完整，请重新解压本地包。");
    const bytes = new Uint8Array(received); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    chunks.length = 0;
    progress(40, "正在初始化抠图引擎…");
    session = await ort.InferenceSession.create(bytes, { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
    progress(55, model === "quality" ? "完整模型正在识别主体，首次使用可能需要数十秒…" : "正在识别照片主体…");
    const result = await session.run({ [session.inputNames[0]]: new ort.Tensor("float32", input, [1, 3, 320, 320]) });
    const output = result[session.outputNames[0]];
    const alpha = segmentationOutput(output.data as Float32Array, 320 * 320);
    for (const tensor of Object.values(result)) tensor.dispose();
    scope.postMessage({ type: "result", alpha }, [alpha.buffer]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    scope.postMessage({ type: "error", message: message.includes("模型") || message.includes("主体") ? message : "本地抠图失败，请尝试快速模式，或更新 Chrome / Edge。" });
  } finally { await session?.release(); }
};
