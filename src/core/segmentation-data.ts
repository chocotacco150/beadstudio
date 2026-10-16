/** U²-Net's reference RGB -> NCHW preprocessing, shared by both model sizes. */
export function segmentationInput(rgba: Uint8ClampedArray, width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || rgba.length !== width * height * 4) throw new Error("抠图输入尺寸无效。");
  const count = width * height;
  let max = 1;
  for (let i = 0; i < count; i++) for (let c = 0; c < 3; c++) {
    // Composite transparent input on white for inference only. Original alpha is retained on export.
    const alpha = rgba[i * 4 + 3] / 255;
    max = Math.max(max, rgba[i * 4 + c] * alpha + 255 * (1 - alpha));
  }
  const out = new Float32Array(count * 3), means = [.485, .456, .406], std = [.229, .224, .225];
  for (let i = 0; i < count; i++) for (let c = 0; c < 3; c++) {
    const alpha = rgba[i * 4 + 3] / 255;
    out[c * count + i] = ((rgba[i * 4 + c] * alpha + 255 * (1 - alpha)) / max - means[c]) / std[c];
  }
  return out;
}

export function segmentationOutput(values: Float32Array, count: number) {
  if (values.length < count || count < 1) throw new Error("抠图模型返回了无效尺寸。");
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < count; i++) {
    if (!Number.isFinite(values[i])) throw new Error("抠图模型返回了无效数据，请重新识别。");
    min = Math.min(min, values[i]); max = Math.max(max, values[i]);
  }
  if (max - min < 1e-6) throw new Error("未能识别出明确主体，请换一张主体更清晰的照片，或使用手动修补。");
  const alpha = new Uint8ClampedArray(count);
  for (let i = 0; i < count; i++) alpha[i] = Math.round((values[i] - min) * 255 / (max - min));
  return alpha;
}
