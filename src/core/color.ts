export type Triple = [number, number, number];
export function hexToRgb(hex: string): Triple {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}
// sRGB -> OKLab: perceptually uniform distance, with D65 white point.
export function rgbToOklab(rgb: Triple): Triple {
  const [r, g, b] = rgb.map((v) => {
    const c = Math.max(0, Math.min(255, v)) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
export function distance(a: Triple, b: Triple) {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
}
export function textColor(hex: string) {
  // Self-contained so the same contrast calculation can travel in the HTML viewer.
  const [r, g, b] = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 145 ? "#162d32" : "#ffffff";
}
