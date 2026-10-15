import { describe, expect, it } from "vitest";
import { cleanSpeckles, floodFill, mergeRareColors } from "./editing";
import { getStats, parseProject } from "./pattern";
import { materialsCSV } from "./materials";
import { preparePhoto } from "./photo";
import { presetSettings } from "./presets";
import type { ConvertSettings, Pattern } from "./types";

const palette = { name: "测试", colors: [
  { code: "W", name: "白", hex: "#FFFFFF" }, { code: "L", name: "近白", hex: "#F4F4F4" },
  { code: "K", name: "黑", hex: "#000000" }, { code: "R", name: "红", hex: "#FF0000" },
] };
const make = (width: number, cells: (string | null)[]): Pattern => ({ version: 1, name: "测试图纸", width, height: cells.length / width, palette, cells });
describe("制作图纸的连通区域编辑", () => {
  it("只填充四向连通的同色格，跨行和对角线不会串色", () => {
    const p = make(3, ["R", null, "R", "R", null, "R", null, "R", "R"]);
    const result = floodFill(p, 0, "W");
    expect(result.cells).toEqual(["W", null, "R", "W", null, "R", null, "R", "R"]);
    expect(p.cells[0]).toBe("R");
    expect(getStats(result).total).toBe(6);
    expect(parseProject(JSON.parse(JSON.stringify(result)))).toEqual(result);
  });
  it("连片擦除保持其他区域，可填充空白但拒绝不存在的色号", () => {
    const p = make(3, ["W", null, "R", "W", null, "R"]);
    expect(floodFill(p, 0, null).cells).toEqual([null, null, "R", null, null, "R"]);
    expect(floodFill(p, 1, "K").cells).toEqual(["W", "K", "R", "W", "K", "R"]);
    expect(floodFill(p, 0, "NO")).toBe(p);
    expect(floodFill(p, -1, "R")).toBe(p);
  });
  it("最大尺寸单色图填充不会递归溢出，统计与格子保持一致", () => {
    const p = make(512, Array(512 * 512).fill("W"));
    const result = floodFill(p, 0, null);
    expect(getStats(result)).toMatchObject({ total: 0, blank: 262144, colorCount: 0 });
  });
});
describe("可撤销清理的数据结果", () => {
  it("合并被包围的杂点，同时保留边缘、空白和受保护色号", () => {
    const cells = Array<string | null>(25).fill("W"); cells[0] = "R"; cells[12] = "R"; cells[24] = null;
    const p = make(5, cells), result = cleanSpeckles(p, 1);
    expect(result.cells[0]).toBe("R"); expect(result.cells[12]).toBe("W"); expect(result.cells[24]).toBeNull();
    expect(cleanSpeckles(p, 1, ["R"]).cells).toEqual(p.cells);
    expect(p.cells[12]).toBe("R");
    const isolated = make(3, [null, null, null, null, "R", null, null, null, null]);
    expect(cleanSpeckles(isolated, 5).cells).toEqual(isolated.cells);
  });
  it("色块大小阈值生效，大色块不会被小杂点清理破坏", () => {
    const cells = Array<string | null>(36).fill("W"); cells[14] = cells[15] = "R";
    const p = make(6, cells);
    expect(cleanSpeckles(p, 1).cells).toEqual(p.cells);
    expect(cleanSpeckles(p, 2).cells.every((c) => c === "W")).toBe(true);
  });
  it("密集的小色块不会在同一次清理中互换颜色", () => {
    const p = make(5, Array.from({ length: 25 }, (_, i) => i % 2 ? "R" : "W"));
    expect(cleanSpeckles(p, 1).cells).toEqual(p.cells);
  });
  it("只合并少量相近色，保留不同色系细节以及透明格", () => {
    const p = make(5, [...Array(16).fill("W"), "L", "R", "K", null]);
    const result = mergeRareColors(p, 2, ["K"]);
    expect(result.cells.slice(-4)).toEqual(["W", "R", "K", null]);
    expect(getStats(result).total).toBe(19);
    expect(mergeRareColors(p, 2, ["L"]).cells[16]).toBe("L");
    expect(mergeRareColors(make(3, ["W", "L", "R"]), 2).cells).toEqual(["W", "L", "R"]);
  });
});
describe("转换风格与备料清单", () => {
  const settings: ConvertSettings = { width: 128, height: 96, keepRatio: true, maxColors: 32, mode: "photo", smoothing: 1, contrast: 8, removeBackground: false, backgroundTolerance: 8, background: null, dither: false };
  it("预设保留构图参数，线稿输出黑白并保留透明度", () => {
    const lineart = presetSettings(settings, "lineart");
    expect(lineart).toMatchObject({ width: 128, height: 96, maxColors: 2, saturation: 0, dither: false });
    const pixels = preparePhoto({ data: new Uint8ClampedArray([20, 20, 20, 255, 130, 130, 130, 255, 240, 240, 240, 255, 250, 250, 250, 0]), width: 4, height: 1, scale: 1, settings: lineart });
    expect(pixels[0]).toBe(0); expect(pixels[8]).toBe(255); expect(pixels[15]).toBe(0);
    expect([...new Set(Array.from(pixels).filter((_, i) => i % 4 !== 3))].sort()).toEqual([0, 255]);
  });
  it("像素原稿跳过明暗与饱和度调整，照片调整不增加空白格", () => {
    const data = new Uint8ClampedArray([80, 90, 120, 255]);
    const pixel = preparePhoto({ data, width: 1, height: 1, scale: 1, settings: { ...presetSettings(settings, "pixel"), brightness: 20, saturation: 0, contrast: 20 } });
    expect([...pixel]).toEqual([...data]);
    const bright = preparePhoto({ data, width: 1, height: 1, scale: 1, settings: { ...settings, smoothing: 0, contrast: 0, brightness: 20 } });
    expect(bright[0]).toBeGreaterThan(data[0]); expect(bright[3]).toBe(255);
  });
  it("线稿自适应阈值保留浅色纸张上的淡铅笔线", () => {
    const pixels = preparePhoto({ data: new Uint8ClampedArray([230, 230, 230, 255, 250, 250, 250, 255]), width: 2, height: 1, scale: 1, settings: presetSettings(settings, "lineart") });
    expect([...pixels]).toEqual([0, 0, 0, 255, 255, 255, 255, 255]);
  });
  it("CSV 包含实际用量，不统计空白，并正确处理中文、引号和表格公式", () => {
    const p = { ...make(2, ["R", "R", "W", null]), name: '=1+1,"图纸"' };
    const csv = materialsCSV(p);
    expect(csv).toContain('"\'=1+1,""图纸"""');
    expect(csv).toContain('"R","红","#FF0000",2');
    expect(csv.split("\r\n").filter(Boolean)).toHaveLength(3);
  });
});
