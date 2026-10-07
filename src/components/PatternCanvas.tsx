import { useCallback, useEffect, useRef, useState } from "react";
import { Scan, ZoomIn, ZoomOut } from "lucide-react";
import { drawPattern } from "../core/render";
import type { DisplayOptions, Pattern, Tool } from "../core/types";
const CELL = 16,
  GUTTER = 28;
export function PatternCanvas({
  pattern,
  tool,
  color,
  display,
  highlight,
  onCommit,
  onPick,
  onHover,
  disabled = false,
}: {
  pattern: Pattern;
  tool: Tool;
  color: string;
  display: DisplayOptions;
  highlight: string | null;
  onCommit: (p: Pattern) => void;
  onPick: (c: string) => void;
  onHover: (s: string) => void;
  disabled?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    draft = useRef<Pattern | null>(null);
  const [zoom, setZoom] = useState(1),
    [pan, setPan] = useState({ x: 0, y: 0 });
  const [viewport, setViewport] = useState({ width: 1, height: 1 });
  const gesture = useRef<{
    type: "draw" | "pan";
    x: number;
    y: number;
    panX: number;
    panY: number;
    last: number | null;
  } | null>(null);
  const g = display.coordinates ? GUTTER : 0,
    w = pattern.width * CELL + 2 * g,
    h = pattern.height * CELL + 2 * g;
  const render = useCallback(() => {
    const c = canvas.current;
    if (!c) return;
    // Render only the viewport at device resolution; zoom never enlarges a
    // low-resolution full-chart bitmap, and a 512² chart stays cheap to pan.
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.ceil(viewport.width * ratio);
    c.height = Math.ceil(viewport.height * ratio);
    const ctx = c.getContext("2d")!;
    ctx.scale(ratio, ratio);
    const left = (viewport.width - w * zoom) / 2 + pan.x,
      top = (viewport.height - h * zoom) / 2 + pan.y;
    ctx.translate(left, top);
    ctx.scale(zoom, zoom);
    drawPattern(ctx, draft.current ?? pattern, {
      ...display,
      codes: display.codes && CELL * zoom >= 10,
      fineGrid: CELL * zoom >= 5,
      pixelSnap: { scale: zoom * ratio, x: left * ratio, y: top * ratio },
      cellSize: CELL,
      gutter: GUTTER,
      highlight,
      viewport: {
        left: -left / zoom,
        top: -top / zoom,
        right: (viewport.width - left) / zoom,
        bottom: (viewport.height - top) / zoom,
      },
    });
  }, [w, h, pattern, display, highlight, viewport, zoom, pan]);
  useEffect(() => {
    render();
  }, [render]);
  const fit = useCallback(() => {
    if (!host.current) return;
    const r = host.current.getBoundingClientRect();
    setViewport({ width: r.width, height: r.height });
    setZoom(
      Math.max(0.025, Math.min(2, (r.width - 32) / w, (r.height - 32) / h)),
    );
    setPan({ x: 0, y: 0 });
  }, [w, h]);
  useEffect(() => {
    fit();
  }, [pattern.width, pattern.height]); // preserve zoom through editing
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) =>
        Math.max(0.025, Math.min(8, z * Math.exp(-e.deltaY * 0.0015))),
      );
    };
    element.addEventListener("wheel", wheel, { passive: false });
    const observer = new ResizeObserver(() => {
      fit();
    });
    observer.observe(element);
    return () => {
      element.removeEventListener("wheel", wheel);
      observer.disconnect();
    };
  }, [fit]);
  const cellAt = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    const left = (r.width - w * zoom) / 2 + pan.x,
      top = (r.height - h * zoom) / 2 + pan.y;
    const x = Math.floor(((e.clientX - r.left - left) / zoom - g) / CELL),
      y = Math.floor(((e.clientY - r.top - top) / zoom - g) / CELL);
    return x >= 0 && x < pattern.width && y >= 0 && y < pattern.height
      ? y * pattern.width + x
      : null;
  };
  const paint = (index: number) => {
    if (!draft.current) return;
    const value = tool === "eraser" ? null : color;
    const previous = gesture.current?.last;
    if (previous !== null && previous !== undefined) {
      let x0 = previous % pattern.width,
        y0 = Math.floor(previous / pattern.width);
      const x1 = index % pattern.width,
        y1 = Math.floor(index / pattern.width),
        dx = Math.abs(x1 - x0),
        dy = -Math.abs(y1 - y0),
        sx = x0 < x1 ? 1 : -1,
        sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      for (;;) {
        draft.current.cells[y0 * pattern.width + x0] = value;
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) {
          err += dy;
          x0 += sx;
        }
        if (e2 <= dx) {
          err += dx;
          y0 += sy;
        }
      }
    } else draft.current.cells[index] = value;
    if (gesture.current) gesture.current.last = index;
    render();
  };
  const finish = () => {
    if (draft.current) {
      const p = draft.current;
      draft.current = null;
      if (p.cells.some((c, i) => c !== pattern.cells[i])) onCommit(p);
    }
    gesture.current = null;
  };
  return (
    <div className="canvas-host" ref={host} data-testid="canvas-host">
      <div className={`canvas-stage viewport-stage tool-${tool}`}>
        <canvas
          ref={canvas}
          style={{ width: "100%", height: "100%" }}
          aria-label="拼豆图纸编辑画布"
          onPointerDown={(e) => {
            if (disabled) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            if (tool === "pan" || e.button === 1) {
              gesture.current = {
                type: "pan",
                x: e.clientX,
                y: e.clientY,
                panX: pan.x,
                panY: pan.y,
                last: null,
              };
              return;
            }
            const index = cellAt(e);
            if (index === null) return;
            if (tool === "picker") {
              const c = pattern.cells[index];
              if (c) onPick(c);
              return;
            }
            gesture.current = {
              type: "draw",
              x: e.clientX,
              y: e.clientY,
              panX: pan.x,
              panY: pan.y,
              last: null,
            };
            draft.current = { ...pattern, cells: [...pattern.cells] };
            paint(index);
          }}
          onPointerMove={(e) => {
            const gestureNow = gesture.current;
            if (gestureNow?.type === "pan") {
              setPan({
                x: gestureNow.panX + e.clientX - gestureNow.x,
                y: gestureNow.panY + e.clientY - gestureNow.y,
              });
              return;
            }
            const index = cellAt(e);
            if (index !== null) {
              onHover(
                `第 ${(index % pattern.width) + 1} 列，第 ${Math.floor(index / pattern.width) + 1} 行 · ${pattern.cells[index] ?? "空白"}`,
              );
              if (gestureNow?.type === "draw") paint(index);
            } else if (gestureNow) gestureNow.last = null;
          }}
          onPointerUp={finish}
          onPointerCancel={finish}
          onLostPointerCapture={finish}
        />
      </div>
      {display.codes && CELL * zoom < 10 && (
        <span className="canvas-hint">放大后查看色号</span>
      )}
      <div className="zoom-controls">
        <button
          aria-label="缩小"
          title="缩小"
          onClick={() => setZoom((z) => Math.max(0.025, z / 1.25))}
        >
          <ZoomOut size={17} />
        </button>
        <span
          title={
            display.codes && CELL * zoom < 10 ? "放大后显示色号" : "当前缩放"
          }
        >
          {Math.round(zoom * 100)}%
        </span>
        <button
          aria-label="放大"
          title="放大"
          onClick={() => setZoom((z) => Math.min(8, z * 1.25))}
        >
          <ZoomIn size={17} />
        </button>
        <i />
        <button aria-label="适应画布" title="适应画布" onClick={fit}>
          <Scan size={17} />
        </button>
      </div>
    </div>
  );
}
