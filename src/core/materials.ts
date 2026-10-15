import type { Pattern } from "./types";
import { getStats } from "./pattern";

// Quote all text fields, escape CSV quotes, and neutralize spreadsheet formulas
// in user-provided names. BOM is added by the download layer for Windows Excel.
export function materialsCSV(pattern: Pattern): string {
  const quote = (value: string) => `"${(/^[\s]*[=+@-]/.test(value) ? "'" + value : value).replace(/"/g, '""')}"`;
  return ["图纸名称,色板名称,色号,颜色名称,HEX,用量（颗）", ...getStats(pattern).used.map((c) => [quote(pattern.name), quote(pattern.palette.name), quote(c.code), quote(c.name), quote(c.hex), c.count].join(","))].join("\r\n") + "\r\n";
}
