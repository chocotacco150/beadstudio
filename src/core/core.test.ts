import { describe, it, expect } from "vitest";
import { quantize } from "./quantize";
import { actualSize, getStats, parseProject, replaceColor } from "./pattern";
import { parsePalette } from "./palette";
import type { ConvertSettings, Pattern } from "./types";
import { preparePhoto, removeEdgeBackground } from "./photo";
const colors = [
  { code: "W", name: "白", hex: "#FFFFFF" },
  { code: "K", name: "黑", hex: "#000000" },
  { code: "R", name: "红", hex: "#FF0000" },
];
const p: Pattern = {
  version: 1,
  name: "测试",
  width: 2,
  height: 2,
  cells: ["R", null, "W", "R"],
  palette: { name: "测试色板", colors },
};
describe("图纸数据与编辑", () => {
  it("统计空白不算用量，替色后统计与格子一致", () => {
    expect(getStats(p).total).toBe(3);
    const edited = replaceColor(p, "R", "K");
    expect(edited.cells).toEqual(["K", null, "W", "K"]);
    expect(getStats(edited).used.find((c) => c.code === "K")?.count).toBe(2);
    expect(getStats(replaceColor(edited, "K", null)).total).toBe(1);
    expect(p.cells).toEqual(["R", null, "W", "R"]);
  });
  it("保留宽高比并限制在输入边界内", () => {
    expect(actualSize(48, 48, 2, true)).toEqual({ width: 48, height: 24 });
    expect(actualSize(32, 64, 0.5, true)).toEqual({ width: 32, height: 64 });
    expect(actualSize(32, 48, 2, false)).toEqual({ width: 32, height: 48 });
    expect(actualSize(512, 512, 1, true)).toEqual({ width: 512, height: 512 });
    expect(() => actualSize(513, 48, 1, true)).toThrow();
    expect(() => actualSize(NaN, 48, 1, true)).toThrow();
  });
  it("项目往返完整保留编辑数据，并拒绝无效颜色引用", () => {
    expect(parseProject(JSON.parse(JSON.stringify(p)))).toEqual(p);
    expect(() =>
      parseProject({ ...p, cells: ["NO", null, "W", "R"] }),
    ).toThrow();
    expect(() => parseProject({ ...p, cells: ["R"] })).toThrow();
    expect(() => parseProject({ ...p, version: 2 })).toThrow();
  });
  it("色板拒绝重复编号和非法 HEX", () => {
    expect(() => parsePalette({ colors: [colors[0], colors[0]] })).toThrow();
    expect(() =>
      parsePalette({ colors: [{ ...colors[0], hex: "white" }] }),
    ).toThrow();
    expect(parsePalette(colors).colors).toHaveLength(3);
  });
});
const photoSettings: ConvertSettings = {
  width: 128,
  height: 128,
  keepRatio: true,
  maxColors: 32,
  dither: false,
  background: null,
  mode: "photo",
  smoothing: 1,
  contrast: 0,
  removeBackground: false,
  backgroundTolerance: 8,
};
describe("日常照片处理", () => {
  it("以区域平均采样照片，透明颜色不污染前景", () => {
    const data = new Uint8ClampedArray([
      255, 0, 0, 255, 0, 0, 255, 255, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    const pixels = preparePhoto({
      data,
      width: 1,
      height: 1,
      scale: 2,
      settings: photoSettings,
    });
    expect([...pixels]).toEqual([128, 0, 128, 128]);
    const filled = preparePhoto({
      data,
      width: 1,
      height: 1,
      scale: 2,
      settings: { ...photoSettings, background: "#FFFFFF" },
    });
    expect(filled[3]).toBe(255);
    expect(filled[1]).toBeGreaterThan(120);
  });
  it("去除边缘纯色背景但保留封闭的同色区域", () => {
    const data = new Uint8ClampedArray(7 * 7 * 4);
    for (let y = 0; y < 7; y++)
      for (let x = 0; x < 7; x++) {
        const p = (y * 7 + x) * 4;
        const ring =
          x >= 2 && x <= 4 && y >= 2 && y <= 4 && !(x === 3 && y === 3);
        data.set(ring ? [255, 0, 0, 255] : [255, 255, 255, 255], p);
      }
    removeEdgeBackground(data, 7, 7, 8);
    expect(data[3]).toBe(0);
    expect(data[(3 * 7 + 3) * 4 + 3]).toBe(255);
    expect(data[(2 * 7 + 2) * 4 + 3]).toBe(255);
    expect([...data].filter((a, i) => i % 4 === 3 && a === 255)).toHaveLength(
      9,
    );
  });
  it("照片简化减少纹理起伏并保持强烈轮廓与透明格", () => {
    const data = new Uint8ClampedArray(9 * 5 * 4);
    for (let y = 0; y < 5; y++)
      for (let x = 0; x < 9; x++) {
        const v = x < 4 ? ((x + y) % 2 ? 80 : 100) : 240;
        data.set([v, v, v, x === 8 ? 0 : 255], (y * 9 + x) * 4);
      }
    const result = preparePhoto({
      data,
      width: 9,
      height: 5,
      scale: 1,
      settings: { ...photoSettings, smoothing: 2 },
    });
    expect(result[(2 * 9 + 2) * 4]).toBeGreaterThan(80);
    expect(result[(2 * 9 + 2) * 4]).toBeLessThan(100);
    expect(result[(2 * 9 + 4) * 4]).toBeGreaterThan(235);
    expect(result[(2 * 9 + 8) * 4 + 3]).toBe(0);
  });
  it("高细节彩色照片始终只引用真实色板且服从颜色上限", () => {
    const size = 256,
      data = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++)
        data.set([x, y, (x * 13 + y * 7) % 256, 255], (y * size + x) * 4);
    const cells = quantize({
      data,
      width: size,
      height: size,
      colors,
      maxColors: 2,
      dither: false,
    });
    expect(cells).toHaveLength(size * size);
    expect(new Set(cells).size).toBeLessThanOrEqual(2);
    expect(cells.every((c) => colors.some((color) => color.code === c))).toBe(
      true,
    );
  });
});
describe("实际色板量化", () => {
  it("像素插画精确区分落在同一照片分箱中的相近色板色", () => {
    const closeColors = [
      { code: "A", name: "浅灰", hex: "#F9F9F9" },
      { code: "B", name: "白", hex: "#FFFFFF" },
    ];
    const cells = quantize({
      data: new Uint8ClampedArray([249, 249, 249, 255, 255, 255, 255, 255]),
      width: 2,
      height: 1,
      colors: closeColors,
      maxColors: 2,
      dither: false,
      precise: true,
    });
    expect(cells).toEqual(["A", "B"]);
  });
  it("完全匹配真实色板并将透明像素留空", () => {
    const cells = quantize({
      width: 2,
      height: 2,
      data: new Uint8ClampedArray([
        255, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255, 255, 0, 0, 0,
      ]),
      colors,
      maxColors: 3,
      dither: false,
    });
    expect(cells).toEqual(["R", "W", "K", null]);
  });
  it("开启或关闭抖动都遵守颜色上限且保留透明格", () => {
    const data = new Uint8ClampedArray(
      Array.from({ length: 100 }, (_, i) => [
        i * 2.55,
        i * 2.55,
        i * 2.55,
        i === 50 ? 0 : 255,
      ]).flat(),
    );
    for (const dither of [false, true]) {
      const cells = quantize({
        data,
        width: 10,
        height: 10,
        colors,
        maxColors: 2,
        dither,
      });
      expect(new Set(cells.filter((c) => c !== null)).size).toBeLessThanOrEqual(
        2,
      );
      expect(cells[50]).toBeNull();
      expect(cells.filter((c) => c !== null)).toHaveLength(99);
    }
  });
  it("完全透明图返回空图纸", () => {
    expect(
      quantize({
        width: 2,
        height: 1,
        data: new Uint8ClampedArray(8),
        colors,
        maxColors: 8,
        dither: true,
      }),
    ).toEqual([null, null]);
  });
});
