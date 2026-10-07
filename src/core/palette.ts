import type { Palette } from "./types";
import mard from "../data/mard.json";
const samples = [
  ["炭黑", "#25343B"],
  ["纯白", "#FFFFFF"],
  ["奶油", "#FFF1CE"],
  ["浅灰", "#C1C9CF"],
  ["石灰", "#76858F"],
  ["砖红", "#C14D40"],
  ["珊瑚", "#F27C72"],
  ["桃粉", "#F9B4B8"],
  ["橘黄", "#F7A53D"],
  ["蜂蜜", "#DB812E"],
  ["向日葵", "#F5D454"],
  ["浅黄", "#FFF09B"],
  ["浅绿", "#CAE4B0"],
  ["草绿", "#8CB85F"],
  ["森林", "#3B704E"],
  ["薄荷", "#99D3C0"],
  ["青绿", "#3EA99B"],
  ["深青", "#246D70"],
  ["天空", "#A6D9EC"],
  ["海蓝", "#509CBE"],
  ["群青", "#3F639E"],
  ["深蓝", "#253B61"],
  ["薰衣草", "#C1B3DE"],
  ["紫罗兰", "#8669B0"],
  ["深紫", "#604371"],
  ["浅棕", "#D9B18A"],
  ["焦糖", "#B8875F"],
  ["可可", "#775742"],
  ["樱粉", "#EF91B3"],
  ["玫红", "#C75487"],
  ["赤红", "#D4343C"],
  ["深灰", "#4D5963"],
];
export const examplePalette: Palette = {
  name: "通用示例 · 32 色",
  description: "示例色板，S 编号为本工具自定义，不对应任何品牌官方色号。",
  colors: samples.map(([name, hex], i) => ({
    code: `S${String(i + 1).padStart(2, "0")}`,
    name,
    hex,
  })),
};
export const mardPalette = mard as Palette;
export const builtInPalettes = [mardPalette, examplePalette];
export function parsePalette(raw: unknown): Palette {
  const obj = (
    Array.isArray(raw) ? { name: "导入色板", colors: raw } : raw
  ) as Partial<Palette> | null;
  if (
    !obj ||
    typeof obj !== "object" ||
    !Array.isArray(obj.colors) ||
    obj.colors.length < 1 ||
    obj.colors.length > 1000
  )
    throw new Error("色板需要包含 1–1000 种颜色。");
  const seen = new Set<string>();
  const colors = obj.colors.map((c) => {
    if (
      !c ||
      typeof c.code !== "string" ||
      !/^[\w\-]{1,12}$/.test(c.code) ||
      seen.has(c.code)
    )
      throw new Error(
        "颜色编号需唯一，且为 1–12 位字母、数字、下划线或短横线。",
      );
    if (
      typeof c.name !== "string" ||
      !c.name.trim() ||
      c.name.length > 60 ||
      typeof c.hex !== "string" ||
      !/^#[\da-f]{6}$/i.test(c.hex)
    )
      throw new Error("每种颜色必须包含 name、code 和 #RRGGBB 格式的 hex。");
    seen.add(c.code);
    return { code: c.code, name: c.name, hex: c.hex.toUpperCase() };
  });
  return {
    name: typeof obj.name === "string" ? obj.name.slice(0, 80) : "导入色板",
    description:
      typeof obj.description === "string"
        ? obj.description.slice(0, 500)
        : undefined,
    source:
      typeof obj.source === "string" && /^https?:\/\//.test(obj.source)
        ? obj.source
        : undefined,
    colors,
  };
}
