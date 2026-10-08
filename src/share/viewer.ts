import type { Pattern } from "../core/types";
import type { createPatternRenderer } from "../core/render";
import type { getStats } from "../core/pattern";

// Everything used by the viewer is inside this function or passed explicitly.
// It is embedded as a classic inline script, so file:// needs no imports/server.
export function initializeShareViewer(
  pattern: Pattern,
  draw: ReturnType<typeof createPatternRenderer>,
  calculateStats: typeof getStats,
) {
  const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const canvas = byId<HTMLCanvasElement>("chart");
  const host = byId("canvas-host");
  const context = canvas.getContext("2d")!;
  const grid = byId<HTMLInputElement>("grid");
  const codes = byId<HTMLInputElement>("codes");
  const coordinates = byId<HTMLInputElement>("coordinates");
  const zoomLabel = byId("zoom-label");
  const status = byId("cell-status");
  const stats = calculateStats(pattern);
  const colors = new Map(pattern.palette.colors.map((color) => [color.code, color]));
  const cell = 20;
  let scale = 1, left = 0, top = 0, width = 0, height = 0;
  let highlight: string | null = null;
  let scheduled = false;
  let initialized = false;
  const pointers = new Map<number, { x: number; y: number }>();
  const clampScale = (value: number) => Math.max(0.01, Math.min(5, value));
  const gutter = () => coordinates.checked ? cell * 1.8 : 0;
  const format = (value: number) => value.toLocaleString("zh-CN");
  byId("pattern-name").textContent = pattern.name;
  byId("pattern-meta").textContent = `${pattern.width} × ${pattern.height} 格 · ${format(stats.total)} 颗 · ${stats.colorCount} 色`;
  byId("palette-name").textContent = pattern.palette.name;
  byId("required-count").textContent = `${stats.colorCount} 种`;
  byId("total-count").textContent = format(stats.total);
  byId("blank-count").textContent = format(stats.blank);
  if (pattern.palette.description) byId("palette-description").textContent = pattern.palette.description;

  function paint() {
    scheduled = false;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const pixelWidth = Math.max(1, Math.round(width * dpr));
    const pixelHeight = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * left, dpr * top);
    draw(context, pattern, {
      cellSize: cell,
      grid: grid.checked,
      codes: codes.checked && cell * scale >= 16,
      coordinates: coordinates.checked,
      fineGrid: cell * scale >= 6,
      highlight,
      viewport: { left: -left / scale, top: -top / scale, right: (width - left) / scale, bottom: (height - top) / scale },
      pixelSnap: { scale: dpr * scale, x: dpr * left, y: dpr * top },
    });
    zoomLabel.textContent = `${Math.round(scale * 100)}%`;
    byId<HTMLButtonElement>("zoom-out").disabled = scale <= 0.01;
    byId<HTMLButtonElement>("zoom-in").disabled = scale >= 5;
  }
  function requestPaint() {
    if (!scheduled) { scheduled = true; requestAnimationFrame(paint); }
  }
  function fit() {
    const padding = gutter() * 2;
    scale = clampScale(Math.min(width / (pattern.width * cell + padding), height / (pattern.height * cell + padding)) * 0.94);
    left = (width - (pattern.width * cell + padding) * scale) / 2;
    top = (height - (pattern.height * cell + padding) * scale) / 2;
    status.textContent = "滚轮缩放 · 拖动移动 · 放大查看色号";
    requestPaint();
  }
  function zoom(next: number, x = width / 2, y = height / 2) {
    const nextScale = clampScale(next);
    left = x - (x - left) * nextScale / scale;
    top = y - (y - top) * nextScale / scale;
    scale = nextScale;
    requestPaint();
  }
  byId("zoom-out").addEventListener("click", () => zoom(scale / 1.4));
  byId("zoom-in").addEventListener("click", () => zoom(scale * 1.4));
  byId("fit").addEventListener("click", fit);
  grid.addEventListener("change", requestPaint);
  codes.addEventListener("change", requestPaint);
  coordinates.addEventListener("change", fit);
  const observer = new ResizeObserver(() => {
    const oldWidth = width, oldHeight = height;
    width = host.clientWidth;
    height = host.clientHeight;
    if (!initialized && width && height) { initialized = true; fit(); }
    else { left += (width - oldWidth) / 2; top += (height - oldHeight) / 2; requestPaint(); }
  });
  observer.observe(host);
  const localPoint = (event: PointerEvent | WheelEvent) => {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  function showCell(point: { x: number; y: number }) {
    const x = Math.floor(((point.x - left) / scale - gutter()) / cell);
    const y = Math.floor(((point.y - top) / scale - gutter()) / cell);
    if (x < 0 || y < 0 || x >= pattern.width || y >= pattern.height) return;
    const code = pattern.cells[y * pattern.width + x];
    status.textContent = `第 ${y + 1} 行 · 第 ${x + 1} 列 · ${code === null ? "空白，不放拼豆" : `色号 ${code} · ${colors.get(code)?.name ?? ""}`}`;
  }
  function gesture() {
    const points = [...pointers.values()];
    if (points.length < 2) return { ...points[0], distance: 0 };
    return { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2, distance: Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) };
  }
  let previousGesture: ReturnType<typeof gesture> | null = null;
  canvas.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    pointers.set(event.pointerId, localPoint(event));
    previousGesture = gesture();
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add("moving");
    showCell(localPoint(event));
  });
  canvas.addEventListener("pointermove", (event) => {
    const point = localPoint(event);
    if (pointers.has(event.pointerId) && previousGesture) {
      pointers.set(event.pointerId, point);
      const current = gesture();
      const nextScale = previousGesture.distance > 0 && current.distance > 0 ? clampScale(scale * current.distance / previousGesture.distance) : scale;
      left = current.x - (previousGesture.x - left) * nextScale / scale;
      top = current.y - (previousGesture.y - top) * nextScale / scale;
      scale = nextScale;
      previousGesture = current;
      requestPaint();
    }
    showCell(point);
  });
  function release(event: PointerEvent) {
    pointers.delete(event.pointerId);
    previousGesture = pointers.size ? gesture() : null;
    if (!pointers.size) canvas.classList.remove("moving");
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  }
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    const point = localPoint(event);
    zoom(scale * Math.exp(-event.deltaY * 0.0015), point.x, point.y);
  }, { passive: false });
  canvas.addEventListener("keydown", (event) => {
    if (event.key === "+" || event.key === "=") zoom(scale * 1.4);
    else if (event.key === "-") zoom(scale / 1.4);
    else if (event.key === "0") fit();
    else if (event.key === "ArrowLeft") { left += 40; requestPaint(); }
    else if (event.key === "ArrowRight") { left -= 40; requestPaint(); }
    else if (event.key === "ArrowUp") { top += 40; requestPaint(); }
    else if (event.key === "ArrowDown") { top -= 40; requestPaint(); }
    else return;
    event.preventDefault();
  });

  const legend = byId("legend");
  const buttons: HTMLButtonElement[] = [];
  for (const color of [...stats.used].sort((a, b) => a.code.localeCompare(b.code, "en", { numeric: true }))) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "color-row";
    button.dataset.code = color.code;
    button.setAttribute("aria-label", `高亮色号 ${color.code}，需要 ${format(color.count)} 颗`);
    button.setAttribute("aria-pressed", "false");
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.backgroundColor = color.hex;
    swatch.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.className = "color-label";
    const code = document.createElement("strong");
    code.textContent = color.code;
    const name = document.createElement("small");
    name.textContent = color.name;
    label.append(code, name);
    const count = document.createElement("span");
    count.className = "color-count";
    count.textContent = `${format(color.count)} 颗`;
    button.append(swatch, label, count);
    button.addEventListener("click", () => {
      highlight = highlight === color.code ? null : color.code;
      for (const item of buttons) item.setAttribute("aria-pressed", String(item.dataset.code === highlight));
      byId<HTMLButtonElement>("clear-highlight").disabled = highlight === null;
      requestPaint();
    });
    buttons.push(button);
    legend.append(button);
  }
  if (!stats.colorCount) {
    const message = document.createElement("p");
    message.className = "empty";
    message.textContent = "这张图纸全部为空白，不需要拼豆。";
    legend.append(message);
  }
  byId("clear-highlight").addEventListener("click", () => {
    highlight = null;
    for (const button of buttons) button.setAttribute("aria-pressed", "false");
    byId<HTMLButtonElement>("clear-highlight").disabled = true;
    requestPaint();
  });
  byId("save-project").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(pattern, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${pattern.name.replace(/[\\/:*?"<>|]/g, "_").slice(0, 80) || "我的拼豆"}.bead.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  });
}
