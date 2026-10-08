import { describe, expect, it } from "vitest";
import { createShareHTML } from "./share";
import { parseProject, replaceColor } from "./pattern";
import type { Pattern } from "./types";

const pattern: Pattern = {
  version: 1,
  name: "朋友的图纸",
  width: 2,
  height: 2,
  cells: ["R", null, "W", "R"],
  palette: {
    name: "示例色板",
    colors: [
      { code: "R", name: "红色", hex: "#FF0000" },
      { code: "W", name: "白色", hex: "#FFFFFF" },
      { code: "K", name: "黑色", hex: "#000000" },
    ],
  },
};
function embeddedProject(html: string) {
  const data = html.match(/<script id="pattern-data" type="application\/json">([\s\S]*?)<\/script>/);
  if (!data) throw new Error("Embedded project missing");
  return JSON.parse(data[1]);
}
describe("单文件 HTML 分享", () => {
  it("保存实际编辑格子、透明空格和完整色板，可重新加载继续编辑", () => {
    const edited = replaceColor(pattern, "R", "K");
    const html = createShareHTML(edited);
    expect(parseProject(embeddedProject(html))).toEqual(edited);
    expect(html).not.toMatch(/<script[^>]+src=|<link[^>]+href=|type="module"/);
    expect(html).toContain("connect-src 'none'");
  });
  it("项目名称、颜色名称及 Unicode 分隔符不能逃出嵌入的 JSON 和标题", () => {
    const text = '</script><script>window.bad=1</script>&\u2028\u2029';
    const hostile = { ...pattern, name: text, palette: { ...pattern.palette, name: text, colors: pattern.palette.colors.map(color => ({ ...color, name: text })) } };
    const html = createShareHTML(hostile);
    expect(embeddedProject(html)).toEqual(parseProject(hostile));
    expect(html).not.toContain("<script>window.bad=1</script>");
    expect(html.match(/<script\b/g)).toHaveLength(2);
    expect(html).toContain("&lt;/script&gt;");
  });
  it("拒绝损坏的格子引用和超限图纸，不生成无法打开的文件", () => {
    expect(() => createShareHTML({ ...pattern, cells: ["missing", null, "W", "R"] })).toThrow();
    expect(() => createShareHTML({ ...pattern, width: 513 })).toThrow();
  });
});
