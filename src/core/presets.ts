import type { ConvertSettings } from "./types";

export const conversionPresets = [
  { id: "photo", name: "日常照片", short: "保留层次", description: "区域采样与轻度降噪，保留人物、宠物和风景的明暗层次。", maxColors: 32, smoothing: 1, contrast: 8, brightness: 0, saturation: 100 },
  { id: "illustration", name: "卡通插画", short: "集中色块", description: "更强的纹理简化与色彩对比，适合卡通、贴纸和插画。", maxColors: 24, smoothing: 2, contrast: 18, brightness: 0, saturation: 115 },
  { id: "lineart", name: "线稿 / Logo", short: "黑白轮廓", description: "自动计算黑白阈值，去掉灰阶杂色，适合深色线稿与单色 Logo。", maxColors: 2, smoothing: 0, contrast: 0, brightness: 0, saturation: 0 },
  { id: "pixel", name: "像素原稿", short: "保留硬边", description: "最近邻采样，不做降噪和调色。图纸尺寸与原稿像素一致时保留像素边界，颜色仍按色板匹配。", maxColors: 32, smoothing: 0, contrast: 0, brightness: 0, saturation: 100 },
] as const;

export function presetSettings(current: ConvertSettings, mode: ConvertSettings["mode"]): ConvertSettings {
  const p = conversionPresets.find((p) => p.id === mode)!;
  return { ...current, mode, maxColors: p.maxColors, smoothing: p.smoothing, contrast: p.contrast, brightness: p.brightness, saturation: p.saturation, dither: false };
}
