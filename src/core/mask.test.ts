import { describe, expect, it } from "vitest";
import { composeRGBA, keepMaskComponent, maskBounds, maskCoverage, paintMask, refineMask, type SubjectMask } from "./mask";

const make = (width: number, values: number[]): SubjectMask => ({ width, height: values.length / width, data: new Uint8ClampedArray(values) });
const values = (mask: SubjectMask) => Array.from(mask.data);

describe("主体蒙版的阈值、扩缩和羽化", () => {
  it("阈值不会把透明背景变为主体，输出与输入相互独立", () => {
    const mask = make(5, [0, 1, 127, 128, 255]);
    expect(values(refineMask(mask))).toEqual([0, 0, 0, 255, 255]);
    expect(values(refineMask(mask, 0))).toEqual([0, 255, 255, 255, 255]);
    expect(values(refineMask(mask, 255))).toEqual([0, 0, 0, 0, 255]);
    const result = refineMask(mask);
    result.data[0] = 255;
    expect(values(mask)).toEqual([0, 1, 127, 128, 255]);
  });

  it("向外扩展和向内收缩使用有界的像素半径，图像外视为透明", () => {
    const source = make(5, Array.from({ length: 25 }, (_, i) => i === 12 ? 255 : 0));
    const grown = refineMask(source, 128, 0, 1);
    expect(values(grown)).toEqual([
      0, 0, 0, 0, 0,
      0, 255, 255, 255, 0,
      0, 255, 255, 255, 0,
      0, 255, 255, 255, 0,
      0, 0, 0, 0, 0,
    ]);
    expect(refineMask(grown, 128, 0, -1)).toEqual(source);
    expect(values(refineMask(make(3, Array(9).fill(255)), 128, 0, -1))).toEqual([0, 0, 0, 0, 255, 0, 0, 0, 0]);
    expect(maskCoverage(refineMask(source, 128, 0, -1))).toBe(0);
    expect(values(refineMask(make(1, [255]), 128, 0, 10))).toEqual([255]);
    expect(values(refineMask(make(1, [255]), 128, 0, -10))).toEqual([0]);
  });

  it("滑动窗口扩缩与直接二维邻域结果一致，包括极窄图像和大半径", () => {
    for (const [width, height] of [[1, 7], [7, 1], [4, 6], [9, 8]]) {
      const input = Array.from({ length: width * height }, (_, i) => ((i * 31 + Math.floor(i / width) * 7) % 11) < 6 ? 255 : 0);
      for (const offset of [-3, -1, 1, 3]) {
        const radius = Math.abs(offset), expected: number[] = [];
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            let extreme = offset > 0 ? 0 : 255;
            for (let yy = y - radius; yy <= y + radius; yy++) {
              for (let xx = x - radius; xx <= x + radius; xx++) {
                const value = xx >= 0 && xx < width && yy >= 0 && yy < height ? input[yy * width + xx] : 0;
                extreme = offset > 0 ? Math.max(extreme, value) : Math.min(extreme, value);
              }
            }
            expected.push(extreme);
          }
        }
        expect(values(refineMask({ width, height, data: new Uint8ClampedArray(input) }, 128, 0, offset))).toEqual(expected);
      }
    }
  });

  it("羽化创建有限的软边，按照透明外侧采样，并在扩缩之后执行", () => {
    const source = make(5, Array.from({ length: 25 }, (_, i) => i === 12 ? 255 : 0));
    const feathered = refineMask(source, 128, 1);
    expect(values(feathered)).toEqual([
      0, 0, 0, 0, 0,
      0, 28, 28, 28, 0,
      0, 28, 28, 28, 0,
      0, 28, 28, 28, 0,
      0, 0, 0, 0, 0,
    ]);
    const expandedSoft = refineMask(source, 128, 1, 1);
    expect(expandedSoft.data[12]).toBe(255);
    expect(expandedSoft.data[6]).toBe(113);
    expect(expandedSoft.data[0]).toBe(28);
    expect(maskCoverage(feathered)).toBeCloseTo(252 / (25 * 255));
  });
});

describe("可撤销的蒙版修整", () => {
  it("快速画笔通过连续线段连接端点，不留间隙，也不修改历史蒙版", () => {
    const source = make(7, Array(21).fill(0));
    const painted = paintMask(source, [{ x: 0.5, y: 1.5 }, { x: 6.5, y: 1.5 }], 0.6, 255);
    expect(values(painted)).toEqual([...Array(7).fill(0), ...Array(7).fill(255), ...Array(7).fill(0)]);
    expect(maskCoverage(source)).toBe(0);
    const erased = paintMask(painted, [{ x: 3.5, y: 1.5 }], 0.6, 0);
    expect(erased.data[10]).toBe(0);
    expect(painted.data[10]).toBe(255);
    expect(paintMask(source, [], 1, 255)).toEqual(source);
    expect(paintMask(source, [], 1, 255).data).not.toBe(source.data);
  });

  it("图像外笔迹被裁切，远端穿过画面的线段仍连续", () => {
    const source = make(3, Array(9).fill(0));
    expect(maskCoverage(paintMask(source, [{ x: -20, y: -20 }], 1, 255))).toBe(0);
    const stroke = paintMask(source, [{ x: -100, y: 1.5 }, { x: 100, y: 1.5 }], 0.6, 255);
    expect(values(stroke)).toEqual([0, 0, 0, 255, 255, 255, 0, 0, 0]);
  });

  it("点击只保留四向连通主体，不能穿过行末或对角线", () => {
    const source = make(3, [255, 0, 255, 0, 255, 255, 0, 0, 0]);
    expect(values(keepMaskComponent(source, { x: 0.5, y: 0.5 }))).toEqual([255, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(values(keepMaskComponent(source, { x: 2.5, y: 0.5 }))).toEqual([0, 0, 255, 0, 255, 255, 0, 0, 0]);
    expect(values(source)).toEqual([255, 0, 255, 0, 255, 255, 0, 0, 0]);
    expect(keepMaskComponent(source, { x: 1, y: 0 })).toEqual(source);
    expect(keepMaskComponent(source, { x: -1, y: 0 })).toEqual(source);
    expect(keepMaskComponent(source, { x: 3, y: 0 })).toEqual(source);
  });

  it("保留所选主体软边，移除连接其他主体的软桥和距离相同的边缘", () => {
    const source = make(7, [0, 255, 80, 60, 70, 255, 0]);
    expect(values(keepMaskComponent(source, { x: 1.5, y: 0.5 }))).toEqual([0, 255, 80, 0, 0, 0, 0]);
    expect(values(keepMaskComponent(source, { x: 5.5, y: 0.5 }))).toEqual([0, 0, 0, 0, 70, 255, 0]);
    expect(values(keepMaskComponent(make(5, [20, 255, 80, 0, 60]), { x: 1, y: 0 }))).toEqual([20, 255, 80, 0, 0]);
  });

  it("大面积主体采用迭代连通搜索，不触发递归栈溢出", () => {
    const source: SubjectMask = { width: 1024, height: 1024, data: new Uint8ClampedArray(1024 * 1024).fill(255) };
    const result = keepMaskComponent(source, { x: 0, y: 0 });
    expect(maskCoverage(result)).toBe(1);
    expect(result.data).not.toBe(source.data);
  });
});

describe("主体尺寸、透明度与输入校验", () => {
  it("紧凑裁剪边界包含最后一格，空蒙版返回空，覆盖率按透明度加权", () => {
    const source = make(4, [0, 0, 0, 0, 0, 128, 255, 0, 0, 0, 255, 64]);
    expect(maskBounds(source)).toEqual({ x: 1, y: 1, width: 2, height: 2 });
    expect(maskBounds(source, 0)).toEqual({ x: 1, y: 1, width: 3, height: 2 });
    expect(maskBounds(make(2, [0, 0]), 0)).toBeNull();
    expect(maskCoverage(make(4, [0, 255, 128, 64]))).toBeCloseTo(447 / 1020);
  });

  it("原图透明度与蒙版相乘，保留 RGB，并且不会复活已有透明像素", () => {
    const source = new Uint8ClampedArray([10, 20, 30, 0, 40, 50, 60, 128, 70, 80, 90, 255]);
    const mask = make(3, [255, 128, 128]);
    expect(Array.from(composeRGBA(source, mask))).toEqual([10, 20, 30, 0, 40, 50, 60, 64, 70, 80, 90, 128]);
    expect(source[7]).toBe(128);
    expect(values(mask)).toEqual([255, 128, 128]);
  });

  it("拒绝尺寸不符、过大蒙版、非有限坐标和无效参数", () => {
    const source = make(1, [255]);
    expect(() => maskCoverage({ width: 2, height: 2, data: new Uint8ClampedArray(3) })).toThrow(/尺寸/);
    expect(() => maskBounds({ width: 2049, height: 1, data: new Uint8ClampedArray(2049) })).toThrow(/2048/);
    expect(() => refineMask(source, NaN)).toThrow(/主体阈值/);
    expect(() => refineMask(source, 256)).toThrow(/主体阈值/);
    expect(() => refineMask(source, 128, 33)).toThrow(/边缘羽化/);
    expect(() => refineMask(source, 128, 0, -11)).toThrow(/边缘扩缩/);
    expect(() => paintMask(source, [{ x: Infinity, y: 0 }], 1, 0)).toThrow(/坐标/);
    expect(() => paintMask(source, [], 0, 0)).toThrow(/半径/);
    expect(() => keepMaskComponent(source, { x: 0, y: NaN })).toThrow(/坐标/);
    expect(() => composeRGBA(new Uint8ClampedArray(3), source)).toThrow(/尺寸/);
  });
});
