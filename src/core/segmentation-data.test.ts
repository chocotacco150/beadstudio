import { describe, expect, it } from "vitest";
import { segmentationInput, segmentationOutput } from "./segmentation-data";
describe("主体识别模型输入和输出", () => {
  it("按照参考算法缩放亮度，按 RGB 平面排列，不使用固定 255 代替全局最大值", () => {
    const tensor = segmentationInput(new Uint8ClampedArray([100, 50, 0, 255, 50, 100, 0, 255]), 2, 1);
    expect(tensor[0]).toBeCloseTo((1 - .485) / .229);
    expect(tensor[1]).toBeCloseTo((.5 - .485) / .229);
    expect(tensor[2]).toBeCloseTo((.5 - .456) / .224);
    expect(tensor[4]).toBeCloseTo(-.406 / .225);
  });
  it("透明 RGB 不污染识别输入，黑图不产生除零", () => {
    expect([...segmentationInput(new Uint8ClampedArray([1, 2, 3, 0]), 1, 1)]).toEqual([...segmentationInput(new Uint8ClampedArray([255, 255, 255, 255]), 1, 1)]);
    expect([...segmentationInput(new Uint8ClampedArray([0, 0, 0, 255]), 1, 1)].every(Number.isFinite)).toBe(true);
  });
  it("输出归一化，拒绝无主体、损坏或不完整输出", () => {
    expect([...segmentationOutput(new Float32Array([.2, .5, .8]), 3)]).toEqual([0, 127, 255]);
    expect(() => segmentationOutput(new Float32Array([1, 1]), 2)).toThrow("主体");
    expect(() => segmentationOutput(new Float32Array([NaN, 1]), 2)).toThrow("无效数据");
    expect(() => segmentationOutput(new Float32Array([1]), 2)).toThrow("尺寸");
  });
});
