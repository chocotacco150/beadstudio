export interface PaletteColor {
  code: string;
  name: string;
  hex: string;
}
export interface Palette {
  name: string;
  source?: string;
  description?: string;
  colors: PaletteColor[];
}
export interface Pattern {
  version: 1;
  name: string;
  width: number;
  height: number;
  cells: (string | null)[];
  palette: Palette;
}
export interface Crop {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface ConvertSettings {
  width: number;
  height: number;
  keepRatio: boolean;
  maxColors: number;
  dither: boolean;
  background: string | null;
  mode: "photo" | "illustration" | "lineart" | "pixel";
  smoothing: number;
  contrast: number;
  brightness?: number;
  saturation?: number;
  removeBackground: boolean;
  backgroundTolerance: number;
}
export interface DisplayOptions {
  grid: boolean;
  codes: boolean;
  coordinates: boolean;
}
export type Tool = "brush" | "eraser" | "fill" | "clear" | "picker" | "pan";
export const MAX_DIMENSION = 512;
export const MAX_CELLS = 262144;
