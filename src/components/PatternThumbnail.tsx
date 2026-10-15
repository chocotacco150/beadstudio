import { useEffect, useRef } from "react";
import { drawPattern } from "../core/render";
import type { Pattern } from "../core/types";

export function PatternThumbnail({ pattern, label, original, markChanges = false }: { pattern: Pattern; label: string; original?: Pattern; markChanges?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const size = Math.max(1, Math.min(6, Math.floor(640 / Math.max(pattern.width, pattern.height))));
    canvas.width = pattern.width * size;
    canvas.height = pattern.height * size;
    const ctx = canvas.getContext("2d")!;
    drawPattern(ctx, pattern, { cellSize: size, grid: false, codes: false, coordinates: false, transparent: true });
    if (markChanges && original) {
      ctx.fillStyle = "#d72486aa";
      pattern.cells.forEach((c, i) => {
        if (c !== original.cells[i]) ctx.fillRect(i % pattern.width * size, Math.floor(i / pattern.width) * size, size, size);
      });
    }
  }, [pattern, original, markChanges]);
  return <div className="pattern-thumbnail checker"><canvas ref={ref} aria-label={label} role="img" /></div>;
}
