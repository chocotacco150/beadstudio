import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Brush, Check, Download, Eraser, Hand, LoaderCircle, Redo2, RotateCcw, ScanLine, Scissors, Undo2, Wand2, ZoomIn, ZoomOut } from "lucide-react";
import { maskBounds, maskCoverage, paintMask, refineMask, keepMaskComponent, type SubjectMask } from "../core/mask";
import { segmentImage, type SegmentationProgress } from "../core/segmentation";
import { exportCutoutPNG } from "../core/cutout-image";
import { Modal } from "./Modal";
import "../cutout.css";

interface MaskDocument { mask: SubjectMask; threshold: number; feather: number; offset: number; resolved: boolean }
type EditTool = "erase" | "restore" | "keep" | "pan";
type Point = { x: number; y: number };
const MAX_HISTORY = 12;
const documentFor = (mask: SubjectMask, resolved = false): MaskDocument => ({ mask, threshold: 128, feather: 0, offset: 0, resolved });
const cloneMask = (mask: SubjectMask): SubjectMask => ({ ...mask, data: new Uint8ClampedArray(mask.data) });
function previewImage(image: HTMLImageElement, mask: SubjectMask | null): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
  canvas.width = mask?.width ?? Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = mask?.height ?? Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d")!;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  if (mask) {
    const alpha = document.createElement("canvas");
    alpha.width = mask.width; alpha.height = mask.height;
    const alphaContext = alpha.getContext("2d")!;
    const pixels = alphaContext.createImageData(alpha.width, alpha.height);
    for (let i = 0; i < mask.data.length; i++) pixels.data[i * 4 + 3] = mask.data[i];
    alphaContext.putImageData(pixels, 0, 0);
    context.globalCompositeOperation = "destination-in";
    context.drawImage(alpha, 0, 0);
  }
  return canvas;
}

export function CutoutDialog({ image, name, initialMask, initialTrim = true, onClose, onApply }: {
  image: HTMLImageElement;
  name: string;
  initialMask: SubjectMask | null;
  initialTrim?: boolean;
  onClose: () => void;
  onApply: (result: { mask: SubjectMask; trim: boolean }) => Promise<void>;
}) {
  const [doc, setDocument] = useState<MaskDocument | null>(() => initialMask ? documentFor(cloneMask(initialMask), true) : null);
  const docRef = useRef(doc);
  const past = useRef<MaskDocument[]>([]), future = useRef<MaskDocument[]>([]);
  const [, refreshHistory] = useState(0);
  const adjustmentStart = useRef<MaskDocument | null>(null);
  const resetMask = useRef<SubjectMask | null>(initialMask ? cloneMask(initialMask) : null);
  const resetResolved = useRef(Boolean(initialMask));
  const [hasRecognized, setHasRecognized] = useState(false);
  const [tool, setTool] = useState<EditTool>("erase");
  const [radius, setRadius] = useState(18);
  const [model, setModel] = useState<"fast" | "quality">("fast");
  const [background, setBackground] = useState<"checker" | "white" | "dark">("checker");
  const [trim, setTrim] = useState(initialTrim);
  const [progress, setProgress] = useState<SegmentationProgress | null>(null);
  const [busy, setBusy] = useState(false), [applying, setApplying] = useState(false), [exporting, setExporting] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const controller = useRef<AbortController | null>(null), alive = useRef(true);
  const beforeCanvas = useRef<HTMLCanvasElement>(null), resultCanvas = useRef<HTMLCanvasElement>(null);
  const [surfaceSize, setSurfaceSize] = useState({ width: 400, height: 310 });
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const [cursor, setCursor] = useState<Point | null>(null);
  const drag = useRef<{ kind: "pan"; start: Point; origin: Point } | { kind: "paint"; startDocument: MaskDocument; previous: Point } | null>(null);

  useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort(); }; }, []);
  const update = useCallback((next: MaskDocument | null) => { docRef.current = next; setDocument(next); }, []);
  const pushHistory = useCallback((previous: MaskDocument, next: MaskDocument) => {
    past.current = [...past.current, previous].slice(-MAX_HISTORY);
    future.current = [];
    update(next); refreshHistory((n) => n + 1);
  }, [update]);
  const finishAdjustment = useCallback(() => {
    const previous = adjustmentStart.current, next = docRef.current;
    adjustmentStart.current = null;
    if (previous && next && (previous.threshold !== next.threshold || previous.feather !== next.feather || previous.offset !== next.offset || previous.resolved !== next.resolved)) pushHistory(previous, next);
  }, [pushHistory]);
  const undo = useCallback(() => {
    finishAdjustment();
    const current = docRef.current, previous = past.current.pop();
    if (!current || !previous) return;
    future.current.push(current); update(previous); refreshHistory((n) => n + 1);
  }, [finishAdjustment, update]);
  const redo = useCallback(() => {
    finishAdjustment();
    const current = docRef.current, next = future.current.pop();
    if (!current || !next) return;
    past.current.push(current); update(next); refreshHistory((n) => n + 1);
  }, [finishAdjustment, update]);
  const replaceMask = useCallback((mask: SubjectMask, resolved = false) => {
    finishAdjustment();
    const next = documentFor(mask, resolved), previous = docRef.current;
    if (previous) pushHistory(previous, next); else update(next);
    setError("");
  }, [finishAdjustment, pushHistory, update]);
  const effectiveMask = useMemo(() => doc ? (doc.resolved ? doc.mask : refineMask(doc.mask, doc.threshold, doc.feather, doc.offset)) : null, [doc]);
  const originalPreview = useMemo(() => previewImage(image, null), [image]);
  const resultPreview = useMemo(() => previewImage(image, effectiveMask), [image, effectiveMask]);
  const coverage = useMemo(() => effectiveMask ? maskCoverage(effectiveMask) : 0, [effectiveMask]);
  const bounds = useMemo(() => effectiveMask ? maskBounds(effectiveMask, 1) : null, [effectiveMask]);
  const fit = Math.min(surfaceSize.width / resultPreview.width, surfaceSize.height / resultPreview.height) * .91;
  const scale = fit * view.zoom;

  useEffect(() => {
    const canvas = resultCanvas.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => {
      const rect = canvas.getBoundingClientRect();
      setSurfaceSize({ width: Math.max(1, rect.width), height: Math.max(1, rect.height) });
    });
    observer.observe(canvas); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    for (const [canvas, source] of [[beforeCanvas.current, originalPreview], [resultCanvas.current, resultPreview]] as const) {
      if (!canvas) continue;
      const rect = canvas.getBoundingClientRect(), ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(rect.width * ratio); canvas.height = Math.round(rect.height * ratio);
      const context = canvas.getContext("2d")!;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, rect.width, rect.height);
      const sourceFit = Math.min(rect.width / source.width, rect.height / source.height) * .91;
      const drawWidth = source.width * sourceFit * view.zoom, drawHeight = source.height * sourceFit * view.zoom;
      context.drawImage(source, (rect.width - drawWidth) / 2 + view.x, (rect.height - drawHeight) / 2 + view.y, drawWidth, drawHeight);
    }
  }, [originalPreview, resultPreview, surfaceSize, view]);

  const requestClose = () => { controller.current?.abort(); onClose(); };
  const runRecognition = async () => {
    finishAdjustment(); setError(""); setNotice(""); setBusy(true);
    const abortController = new AbortController(); controller.current = abortController;
    setProgress({ percent: 0, label: "准备本地识别模型…" });
    try {
      const mask = await segmentImage(image, { model, signal: abortController.signal, onProgress: (p) => { if (alive.current) setProgress(p); } });
      if (abortController.signal.aborted || !alive.current) return;
      resetMask.current = cloneMask(mask); resetResolved.current = false; setHasRecognized(true); replaceMask(mask);
      setView({ zoom: 1, x: 0, y: 0 });
      setNotice("主体识别完成。检查边缘后，可用擦除和恢复修整。" );
    } catch (err) {
      if (!alive.current) return;
      if (abortController.signal.aborted || (err instanceof Error && err.name === "AbortError")) setNotice("已取消识别，保留原来的编辑结果。");
      else setError(err instanceof Error ? err.message : "主体识别失败，请重试或使用手动擦除。");
    } finally {
      if (alive.current) { setBusy(false); setProgress(null); }
      if (controller.current === abortController) controller.current = null;
    }
  };
  const startManual = () => {
    const workScale = Math.min(1, 1024 / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * workScale)), height = Math.max(1, Math.round(image.naturalHeight * workScale));
    replaceMask({ width, height, data: new Uint8ClampedArray(width * height).fill(255) });
    setTool("erase"); setNotice("已保留整张图片。用擦除画笔移除背景，也可以随后运行主体识别。");
  };
  const localPoint = (event: ReactPointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const imagePoint = (point: Point): Point => ({
    x: (point.x - (surfaceSize.width - resultPreview.width * scale) / 2 - view.x) / scale,
    y: (point.y - (surfaceSize.height - resultPreview.height * scale) / 2 - view.y) / scale,
  });
  const pointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (busy || applying || (event.button !== 0 && event.button !== 1)) return;
    finishAdjustment();
    const point = localPoint(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    if (tool === "pan" || event.button === 1 || event.altKey) {
      drag.current = { kind: "pan", start: point, origin: { x: view.x, y: view.y } }; return;
    }
    const current = docRef.current;
    if (!current || !effectiveMask) return;
    const location = imagePoint(point);
    if (location.x < 0 || location.y < 0 || location.x >= effectiveMask.width || location.y >= effectiveMask.height) return;
    if (tool === "keep") {
      if ((effectiveMask.data[Math.floor(location.y) * effectiveMask.width + Math.floor(location.x)] || 0) < 128) {
        setNotice("请点击要保留的主体内部；透明区域不能作为主体。"); return;
      }
      replaceMask(keepMaskComponent(effectiveMask, location), true);
      setNotice("已保留点击处相连的主体。被遮挡、未相连的部分可用恢复画笔补回。"); return;
    }
    const edited = paintMask(effectiveMask, [location], radius, tool === "restore" ? 255 : 0);
    drag.current = { kind: "paint", startDocument: current, previous: location };
    update(documentFor(edited, true));
  };
  const pointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = localPoint(event); setCursor(point);
    const action = drag.current;
    if (!action) return;
    if (action.kind === "pan") { setView((v) => ({ ...v, x: action.origin.x + point.x - action.start.x, y: action.origin.y + point.y - action.start.y })); return; }
    const current = docRef.current;
    if (!current) return;
    const location = imagePoint(point);
    update(documentFor(paintMask(current.mask, [action.previous, location], radius, tool === "restore" ? 255 : 0), true));
    action.previous = location;
  };
  const finishStroke = () => {
    const action = drag.current; drag.current = null;
    if (action?.kind === "paint" && docRef.current) {
      pushHistory(action.startDocument, docRef.current);
      if (action.startDocument.feather !== 0 || action.startDocument.offset !== 0 || action.startDocument.threshold !== 128) setNotice("边缘微调已合入当前蒙版，可继续修整；撤销可恢复上一状态。");
    }
  };
  const zoomBy = (factor: number, anchor?: Point) => setView((current) => {
    const zoom = Math.min(8, Math.max(.5, current.zoom * factor)), ratio = zoom / current.zoom;
    const point = anchor ?? { x: surfaceSize.width / 2, y: surfaceSize.height / 2 };
    return { zoom, x: point.x - surfaceSize.width / 2 - (point.x - surfaceSize.width / 2 - current.x) * ratio, y: point.y - surfaceSize.height / 2 - (point.y - surfaceSize.height / 2 - current.y) * ratio };
  });
  useEffect(() => {
    const canvas = resultCanvas.current;
    if (!canvas) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault(); if (drag.current) return;
      const rect = canvas.getBoundingClientRect();
      zoomBy(event.deltaY > 0 ? 1 / 1.15 : 1.15, { x: event.clientX - rect.left, y: event.clientY - rect.top });
    };
    canvas.addEventListener("wheel", wheel, { passive: false });
    return () => canvas.removeEventListener("wheel", wheel);
  }, [surfaceSize.width, surfaceSize.height]);
  const changeEdge = (key: "threshold" | "feather" | "offset", value: number) => {
    const current = docRef.current;
    if (!current) return;
    if (!adjustmentStart.current) adjustmentStart.current = current;
    update({ ...current, [key]: value, resolved: false });
  };
  const apply = async () => {
    finishAdjustment();
    if (!effectiveMask || !bounds) return;
    setError(""); setApplying(true);
    try { await onApply({ mask: effectiveMask, trim }); }
    catch (err) { if (alive.current) setError(err instanceof Error ? err.message : "应用抠图结果失败，请重试。"); }
    finally { if (alive.current) setApplying(false); }
  };
  const savePNG = async () => {
    if (!effectiveMask || !bounds) return;
    setError(""); setExporting(true);
    try { await exportCutoutPNG(image, effectiveMask, name, trim); }
    catch (err) { setError(err instanceof Error ? err.message : "PNG 导出失败，请重试。"); }
    finally { if (alive.current) setExporting(false); }
  };
  const locked = busy || applying;
  return <Modal title="识别照片主体" onClose={requestClose} wide>
    <div className="cutout-workbench" onKeyDown={(event) => {
      if (locked || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z") return;
      event.preventDefault(); if (event.shiftKey) redo(); else undo();
    }}>
      <div className="cutout-intro"><span className="cutout-local-badge"><Scissors size={14} />本机处理</span><p>自动识别主体，再修整边缘。图片无需上传；模型随本地版附带，首次加载可能较慢。</p></div>
      <div className="cutout-recognition-row">
        <label className="cutout-model-field"><span>识别模型</span><select aria-label="抠图识别模型" value={model} onChange={(e) => setModel(e.target.value as "fast" | "quality")} disabled={locked}><option value="fast">快速识别 · 轻量模型</option><option value="quality">精细识别 · 完整模型</option></select></label>
        <button className="primary" onClick={() => void runRecognition()} disabled={locked}><Wand2 size={16} />{doc ? "重新识别主体" : "开始识别主体"}</button>
        <button className="secondary" onClick={startManual} disabled={locked}>保留整张，手动擦除</button>
        <span className="cutout-model-note">{model === "fast" ? "适合先快速试效果" : "模型较大，处理更慢，占用更多内存"}</span>
      </div>
      {busy && <div className="cutout-progress" role="status"><LoaderCircle size={16} className="spin" /><span>{progress?.label || "正在识别…"}</span><progress aria-label="主体识别进度" max={100} value={progress?.percent || 0} /><span>{Math.round(progress?.percent || 0)}%</span><button onClick={() => controller.current?.abort()} className="text-button">取消识别</button></div>}
      {error && <p className="cutout-error" role="alert">{error}</p>}
      <div className="cutout-editor-layout">
        <div className="cutout-main">
          <div className="cutout-edit-toolbar" role="group" aria-label="抠图修整工具">
            {([{ key: "erase", icon: Eraser, label: "擦除背景" }, { key: "restore", icon: Brush, label: "恢复主体" }, { key: "keep", icon: ScanLine, label: "保留点击主体" }, { key: "pan", icon: Hand, label: "移动" }] as const).map(({ key, icon: Icon, label }) => <button key={key} className={tool === key ? "active" : ""} aria-pressed={tool === key} disabled={locked || (!doc && key !== "pan")} onClick={() => setTool(key)}><Icon size={15} />{label}</button>)}
            <span className="cutout-toolbar-spacer" />
            <button className="icon-button" title="撤销（Ctrl+Z）" aria-label="撤销抠图编辑" disabled={locked || !past.current.length} onClick={undo}><Undo2 size={16} /></button><button className="icon-button" title="重做（Ctrl+Shift+Z）" aria-label="重做抠图编辑" disabled={locked || !future.current.length} onClick={redo}><Redo2 size={16} /></button>
          </div>
          <div className="cutout-compare">
            <section className="cutout-preview"><div className="cutout-preview-heading"><strong>原图</strong><span>{image.naturalWidth} × {image.naturalHeight}</span></div><div className={`cutout-surface cutout-bg-${background}`}><canvas ref={beforeCanvas} role="img" aria-label="抠图前的原始照片" /></div></section>
            <section className="cutout-preview"><div className="cutout-preview-heading"><strong>{doc ? "主体预览 · 在这里修整" : "等待识别"}</strong>{doc && <span>保留约 {Math.round(coverage * 100)}%</span>}</div><div className={`cutout-surface cutout-bg-${background} cutout-tool-${tool}`}>
              <canvas ref={resultCanvas} role="img" aria-label="抠图结果编辑画布，可使用工具擦除或恢复主体" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={finishStroke} onPointerCancel={finishStroke} onLostPointerCapture={finishStroke} onPointerLeave={() => setCursor(null)} onContextMenu={(e) => e.preventDefault()} />
              {doc && !locked && cursor && (tool === "erase" || tool === "restore") && <span className={`cutout-brush-cursor ${tool}`} style={{ width: radius * scale * 2, height: radius * scale * 2, left: cursor.x, top: cursor.y }} />}
              {!doc && <div className="cutout-preview-empty"><Scissors size={24} /><span>点击「开始识别主体」<small>也可保留整张图片手动修整</small></span></div>}
            </div></section>
          </div>
          <div className="cutout-view-toolbar"><div className="cutout-backgrounds" role="group" aria-label="抠图预览背景"><span>预览背景</span>{([{ key: "checker", label: "透明棋盘" }, { key: "white", label: "白色" }, { key: "dark", label: "深色" }] as const).map(({ key, label }) => <button key={key} title={label} aria-label={`${label}预览背景`} aria-pressed={background === key} className={`cutout-background-swatch cutout-bg-${key} ${background === key ? "active" : ""}`} onClick={() => setBackground(key)}>{background === key && <Check size={12} />}</button>)}</div><div className="cutout-zoom"><button className="icon-button" aria-label="缩小抠图预览" onClick={() => zoomBy(1 / 1.25)} disabled={view.zoom <= .5}><ZoomOut size={16} /></button><button className="cutout-fit" onClick={() => setView({ zoom: 1, x: 0, y: 0 })} title="适合窗口">{Math.round(view.zoom * 100)}%</button><button className="icon-button" aria-label="放大抠图预览" onClick={() => zoomBy(1.25)} disabled={view.zoom >= 8}><ZoomIn size={16} /></button></div></div>
          <p className="cutout-canvas-hint">滚轮缩放 · 中键或按住 Alt 拖动移动 · 预览背景仅用于检查，导出保留透明区域{effectiveMask && <><br />当前主体工作图 {effectiveMask.width} × {effectiveMask.height} px（自动识别最长边 1600 px）。PNG 按此分辨率导出，裁留白时尺寸相应缩小，缩放预览不影响导出。</>}</p>
        </div>
        <aside className="cutout-refinement">
          <h3>修整与边缘</h3>
          <label className="cutout-slider-label">画笔大小<span>半径 {radius} px</span><input aria-label="抠图画笔半径" type="range" min={2} max={100} value={radius} disabled={locked || !doc} onChange={(e) => setRadius(Number(e.target.value))} /></label>
          <p className="cutout-side-note">擦除移除背景，恢复补回原图内容。画笔从当前预览继续，边缘设置会合入蒙版。</p>
          <div className="cutout-edge-controls">
            {([{ key: "threshold", label: "主体保留阈值", min: 1, max: 254, value: doc?.threshold ?? 128, display: String(doc?.threshold ?? 128) }, { key: "feather", label: "边缘柔化", min: 0, max: 20, value: doc?.feather ?? 0, display: `${doc?.feather ?? 0} px` }, { key: "offset", label: "边缘扩缩", min: -6, max: 6, value: doc?.offset ?? 0, display: `${(doc?.offset ?? 0) > 0 ? "+" : ""}${doc?.offset ?? 0} px` }] as const).map(({ key, label, min, max, value, display }) => <label key={key} className="cutout-slider-label">{label}<span>{display}</span><input type="range" aria-label={label} min={min} max={max} value={value} disabled={locked || !doc} onChange={(e) => changeEdge(key, Number(e.target.value))} onPointerUp={finishAdjustment} onPointerCancel={finishAdjustment} onKeyUp={finishAdjustment} onBlur={finishAdjustment} /></label>)}
            <p className="cutout-side-note">阈值越高保留越少；负值收边，正值扩边。像素按识别蒙版计算。</p>
          </div>
          <button className="secondary cutout-reset" disabled={locked || !resetMask.current} onClick={() => { if (resetMask.current) { replaceMask(cloneMask(resetMask.current), resetResolved.current); setNotice(hasRecognized ? "已恢复最近一次识别结果；可撤销此操作。" : "已恢复打开时的主体蒙版；可撤销此操作。"); } }}><RotateCcw size={14} />{hasRecognized ? "恢复识别结果" : "恢复打开时结果"}</button>
          <p className="cutout-side-note cutout-limitation">毛发、透明物体、复杂遮挡和多个主体可能需要手动修整。保留点击主体按相连区域选择。</p>
        </aside>
      </div>
      <div className="cutout-bottom-settings"><label className="check-row"><input type="checkbox" checked={trim} disabled={locked} onChange={(e) => setTrim(e.target.checked)} />应用时裁去主体周围的透明留白</label><span>{trim ? "画布比例将随主体范围调整" : "保持完整画面与原图比例"}</span></div>
      <p className="cutout-notice" role="status">{notice || (doc && !bounds ? "蒙版已全部透明，请恢复部分主体后再应用。" : "抠图仅在应用后影响图片；生成图纸后，透明位置会成为空白格。")}</p>
      <div className="modal-actions cutout-actions"><span>修整支持撤销 / 重做，最多保留 {MAX_HISTORY} 步</span><div><button className="secondary" disabled={locked || exporting || !bounds} onClick={() => void savePNG()}>{exporting ? <LoaderCircle size={15} className="spin" /> : <Download size={15} />}透明 PNG</button><button className="primary" disabled={locked || !bounds} onClick={() => void apply()}>{applying ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}应用到图片</button></div></div>
    </div>
  </Modal>;
}
