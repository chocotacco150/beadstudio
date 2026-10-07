import { describe, it, expect } from "vitest";
import { quantize } from "./quantize";
import { actualSize, getStats, parseProject, replaceColor } from "./pattern";
import { parsePalette } from "./palette";
import type { Pattern } from "./types";
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
    expect(() => actualSize(201, 48, 1, true)).toThrow();
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
describe("实际色板量化", () => {
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
