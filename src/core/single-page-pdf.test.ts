import { describe, expect, it } from "vitest";
import { singlePageLayout } from "./single-page-pdf";
import { pdfLayout } from "./export";
import type { Pattern } from "./types";

function chart(width: number, height: number, colorCount: number): Pattern {
  const colors = Array.from({ length: colorCount }, (_, index) => ({ code: `C${index}`, name: `颜色 ${index}`, hex: "#AABBCC" }));
  return { version: 1, name: "测试", width, height, palette: { name: "示例", colors }, cells: Array.from({ length: width * height }, (_, index) => colors[index % colors.length].code) };
}
describe("PDF 排版", () => {
  it("细长大图与大量色号都能放在同一个合法尺寸的 PDF 页面内", () => {
    for (const pattern of [chart(2, 512, 1000), chart(512, 2, 1000), chart(512, 512, 32)]) {
      const layout = singlePageLayout(pattern);
      expect(layout.width).toBeLessThanOrEqual(14400);
      expect(layout.height).toBeLessThanOrEqual(14400);
      expect(layout.gridY + pattern.height * layout.cellSize).toBeLessThan(layout.legendY);
      expect(layout.legendY + layout.rows * 24).toBeLessThan(layout.height);
    }
    expect(singlePageLayout(chart(128, 102, 32))).toMatchObject({ width: 1616, height: 1520 });
  });
  it("A4 拼接和实物尺寸打印保持独立可用", () => {
    expect(pdfLayout(chart(128, 102, 32), 5)).toMatchObject({ across: 4, down: 3, legendPages: 1, totalPages: 13 });
  });
});
