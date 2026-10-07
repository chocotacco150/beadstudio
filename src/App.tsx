import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  Brush,
  Check,
  ChevronDown,
  Copy,
  Crop as CropIcon,
  Eraser,
  FileImage,
  FolderOpen,
  Grid2X2,
  Hand,
  ImagePlus,
  Info,
  LoaderCircle,
  LockKeyhole,
  Palette as PaletteIcon,
  Pipette,
  Redo2,
  Replace,
  RotateCcw,
  Save,
  Settings2,
  Sparkles,
  Undo2,
  Upload,
  X,
  HelpCircle,
  FileJson,
  FileText,
} from "lucide-react";
import type {
  Crop,
  ConvertSettings,
  DisplayOptions,
  Palette,
  Pattern,
  Tool,
} from "./core/types";
import {
  actualSize,
  getStats,
  parseProject,
  replaceColor,
} from "./core/pattern";
import { builtInPalettes, mardPalette, parsePalette } from "./core/palette";
import {
  convertImage,
  fullCrop,
  loadImage,
  readImageFile,
} from "./core/sampling";
import {
  downloadJSON,
  exportChartPNG,
  exportPatternPNG,
  exportPDF,
  filename,
  pdfLayout,
} from "./core/export";
import { useHistory } from "./hooks/useHistory";
import { PatternCanvas } from "./components/PatternCanvas";
import { CropDialog } from "./components/CropDialog";
import { Modal } from "./components/Modal";
const defaultSettings: ConvertSettings = {
  width: 128,
  height: 128,
  keepRatio: true,
  maxColors: 32,
  dither: false,
  background: null,
  mode: "photo",
  smoothing: 1,
  contrast: 8,
  removeBackground: false,
  backgroundTolerance: 8,
};
const samples = {
  photo: { src: "/sample-photo.jpg", name: "庭院里的向日葵" },
  pixel: { src: "/sample-cat.png", name: "茶杯里的小橘" },
};
const toolItems = [
  { key: "brush", label: "画笔", shortcut: "B", icon: Brush },
  { key: "eraser", label: "橡皮擦", shortcut: "E", icon: Eraser },
  { key: "picker", label: "吸管", shortcut: "I", icon: Pipette },
  { key: "pan", label: "移动", shortcut: "H", icon: Hand },
] as const;
export default function App() {
  const history = useHistory(),
    { pattern } = history;
  const [settings, setSettings] = useState(defaultSettings),
    [palette, setPalette] = useState<Palette>(mardPalette),
    [palettes, setPalettes] = useState(builtInPalettes);
  const [source, setSource] = useState(samples.photo.src),
    [image, setImage] = useState<HTMLImageElement | null>(null),
    [sourceName, setSourceName] = useState(samples.photo.name),
    [crop, setCrop] = useState<Crop>(fullCrop);
  const [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0),
    [message, setMessage] = useState<{ text: string; error: boolean } | null>(
      null,
    );
  const [tool, setTool] = useState<Tool>("brush"),
    [selected, setSelected] = useState("A6"),
    [highlight, setHighlight] = useState<string | null>(null),
    [display, setDisplay] = useState<DisplayOptions>({
      grid: false,
      codes: false,
      coordinates: true,
    });
  const [dialog, setDialog] = useState<
      "crop" | "export" | "replace" | "help" | null
    >(null),
    [compare, setCompare] = useState(false),
    [paletteTab, setPaletteTab] = useState<"used" | "all">("used"),
    [search, setSearch] = useState(""),
    [mobileTab, setMobileTab] = useState<"settings" | "canvas" | "palette">(
      "canvas",
    ),
    [hover, setHover] = useState("每格一颗拼豆"),
    [dragging, setDragging] = useState(false);
  const [exportType, setExportType] = useState<"pattern" | "chart" | "pdf">(
      "chart",
    ),
    [beadMm, setBeadMm] = useState(5),
    [replaceFrom, setReplaceFrom] = useState(""),
    [replaceTo, setReplaceTo] = useState("");
  const imageInput = useRef<HTMLInputElement>(null),
    paletteInput = useRef<HTMLInputElement>(null),
    projectInput = useRef<HTMLInputElement>(null),
    objectURL = useRef<string | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = (text: string, error = false) => {
    setMessage({ text, error });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), 6000);
  };
  const stats = useMemo(
    () =>
      pattern
        ? getStats(pattern)
        : { used: [], total: 0, colorCount: 0, blank: 0 },
    [pattern],
  );
  const editPalette = pattern?.palette ?? palette;
  const requiredColors = useMemo(
    () =>
      [...stats.used].sort((a, b) =>
        a.code.localeCompare(b.code, "en", { numeric: true }),
      ),
    [stats.used],
  );
  const selectedColor =
    editPalette.colors.find((c) => c.code === selected) ??
    editPalette.colors[0];
  const dimensions = useMemo(() => {
    try {
      return actualSize(
        settings.width,
        settings.height,
        image
          ? (image.naturalWidth * crop.width) /
              (image.naturalHeight * crop.height)
          : 1,
        settings.keepRatio,
      );
    } catch {
      return null;
    }
  }, [settings, image, crop]);
  useEffect(() => setHover("每格一颗拼豆"), [pattern?.width, pattern?.height]);
  useEffect(() => {
    let active = true;
    setBusy(true);
    loadImage(samples.photo.src)
      .then(async (img) => {
        if (!active) return;
        setImage(img);
        const p = await convertImage(
          img,
          fullCrop,
          defaultSettings,
          mardPalette,
          samples.photo.name,
          (n) => {
            if (active) setProgress(n);
          },
        );
        if (active) {
          history.reset(p);
          setBusy(false);
        }
      })
      .catch((e) => {
        if (active) {
          notify(e.message, true);
          setBusy(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(
    () => () => {
      if (objectURL.current) URL.revokeObjectURL(objectURL.current);
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement ||
        e.target instanceof HTMLTextAreaElement ||
        dialog ||
        busy
      )
        return;
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === "z") {
        e.preventDefault();
        if (e.shiftKey) history.redo();
        else history.undo();
      } else if ((e.ctrlKey || e.metaKey) && k === "y") {
        e.preventDefault();
        history.redo();
      } else if (!(e.ctrlKey || e.metaKey)) {
        const found = toolItems.find((t) => t.shortcut.toLowerCase() === k);
        if (found) setTool(found.key);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [history.undo, history.redo, dialog, busy]);
  const updateSetting = <K extends keyof ConvertSettings>(
    key: K,
    value: ConvertSettings[K],
  ) => setSettings((s) => ({ ...s, [key]: value }));
  async function upload(file?: File) {
    if (!file || busy) return;
    setBusy(true);
    setProgress(0);
    try {
      const data = await readImageFile(file);
      if (objectURL.current) URL.revokeObjectURL(objectURL.current);
      objectURL.current = data.src;
      setImage(data.image);
      setSource(data.src);
      setCrop(fullCrop);
      const name = file.name.replace(/\.[^.]+$/, "");
      setSourceName(name);
      const p = await convertImage(
        data.image,
        fullCrop,
        settings,
        palette,
        name,
        setProgress,
      );
      history.commit(p);
      setSelected(p.palette.colors[0].code);
      setHighlight(null);
      setMobileTab("canvas");
      notify("图片已转换，可以开始编辑。");
    } catch (e) {
      notify(e instanceof Error ? e.message : "上传失败，请重试。", true);
    } finally {
      setBusy(false);
    }
  }
  async function generate() {
    if (!image || busy) return;
    setBusy(true);
    setProgress(0);
    try {
      const p = await convertImage(
        image,
        crop,
        settings,
        palette,
        sourceName,
        setProgress,
      );
      history.commit(p);
      setSelected(p.palette.colors[0].code);
      setHighlight(null);
      setMobileTab("canvas");
      notify("图纸已重新生成，原编辑可通过撤销恢复。");
    } catch (e) {
      notify(e instanceof Error ? e.message : "转换失败", true);
    } finally {
      setBusy(false);
    }
  }
  async function useSample(kind: "photo" | "pixel") {
    if (busy) return;
    setBusy(true);
    setProgress(0);
    try {
      const sample = samples[kind];
      const nextSettings =
        kind === "photo"
          ? {
              ...settings,
              mode: "photo" as const,
              width: 128,
              height: 128,
              maxColors: 32,
              keepRatio: true,
              removeBackground: false,
            }
          : {
              ...settings,
              mode: "pixel" as const,
              width: 64,
              height: 64,
              keepRatio: true,
              removeBackground: false,
            };
      const img = await loadImage(sample.src);
      const p = await convertImage(
        img,
        fullCrop,
        nextSettings,
        palette,
        sample.name,
        setProgress,
      );
      if (objectURL.current) {
        URL.revokeObjectURL(objectURL.current);
        objectURL.current = null;
      }
      setImage(img);
      setSettings(nextSettings);
      setSource(sample.src);
      setSourceName(sample.name);
      setCrop(fullCrop);
      history.commit(p);
      setHighlight(null);
      setSelected(p.palette.colors[0].code);
      notify("已载入示例图片。");
    } catch (e) {
      notify(e instanceof Error ? e.message : "示例载入失败", true);
    } finally {
      setBusy(false);
    }
  }
  async function readJSON(file: File | undefined, kind: "palette" | "project") {
    if (!file || busy) return;
    try {
      if (file.size > 15 * 1024 * 1024)
        throw new Error("JSON 文件不能超过 15 MB。");
      const data = JSON.parse(await file.text());
      if (kind === "palette") {
        const p = parsePalette(data);
        setPalettes((list) => [...list.filter((v) => v.name !== p.name), p]);
        setPalette(p);
        notify(`已导入 ${p.colors.length} 色，重新生成后应用到图纸。`);
      } else {
        const p = parseProject(data);
        history.commit(p);
        setPalette(p.palette);
        setPalettes((list) => [
          ...list.filter((v) => v.name !== p.palette.name),
          p.palette,
        ]);
        setSettings((s) => ({
          ...s,
          width: p.width,
          height: p.height,
          keepRatio: false,
        }));
        setImage(null);
        if (objectURL.current) {
          URL.revokeObjectURL(objectURL.current);
          objectURL.current = null;
        }
        setSource("");
        setSourceName("项目未包含原图");
        setCrop(fullCrop);
        setHighlight(null);
        setSelected(p.palette.colors[0].code);
        setCompare(false);
        setMobileTab("canvas");
        notify("项目已加载，格子和编辑结果已恢复。");
      }
    } catch (e) {
      notify(e instanceof Error ? e.message : "JSON 加载失败", true);
    }
  }
  function selectColor(code: string) {
    setSelected(code);
    setHighlight((h) => (h === code ? null : code));
    setTool("brush");
  }
  async function copyRequiredCodes() {
    try {
      await navigator.clipboard.writeText(
        `${editPalette.name}\n所需色号（${requiredColors.length} 种）：${requiredColors.map((c) => c.code).join("、")}`,
      );
      notify("已复制本图纸的全部所需色号。");
    } catch {
      notify("复制失败，请允许浏览器访问剪贴板后重试。", true);
    }
  }
  async function handleExport() {
    if (!pattern || busy) return;
    setMessage(null);
    setBusy(true);
    setProgress(0);
    try {
      await new Promise((r) => setTimeout(r, 40));
      if (exportType === "pattern") await exportPatternPNG(pattern);
      else if (exportType === "chart") await exportChartPNG(pattern);
      else await exportPDF(pattern, beadMm, setProgress);
      setDialog(null);
      notify("导出完成，文件已下载。");
    } catch (e) {
      notify(e instanceof Error ? e.message : "导出失败", true);
    } finally {
      setBusy(false);
    }
  }
  const visibleColors = (
    paletteTab === "used"
      ? stats.used
      : editPalette.colors.map((c) => ({
          ...c,
          count: stats.used.find((u) => u.code === c.code)?.count ?? 0,
        }))
  ).filter((c) =>
    `${c.code} ${c.name} ${c.hex}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className="app-shell">
      <header className="app-header">
        <a className="brand" href="#" aria-label="豆图首页">
          <span className="brand-mark">
            <Grid2X2 size={24} />
          </span>
          <strong>
            豆图<span>BEAD STUDIO</span>
          </strong>
        </a>
        <div className="header-divider" />
        <span className="header-label">图片转拼豆图纸</span>
        <div className="header-actions">
          <button
            className="text-button"
            aria-label="打开项目"
            title="打开项目"
            onClick={() => projectInput.current?.click()}
            disabled={busy}
          >
            <FolderOpen size={17} />
            <span>打开项目</span>
          </button>
          <button
            className="text-button"
            aria-label="保存项目"
            title="保存项目"
            onClick={() => {
              if (pattern) {
                downloadJSON(pattern, `${filename(pattern.name)}.bead.json`);
                notify("项目已保存，包含图纸和完整色板。");
              }
            }}
            disabled={!pattern || busy}
          >
            <Save size={17} />
            <span>保存项目</span>
          </button>
          <button
            className="primary export-button"
            onClick={() => {
              setMessage(null);
              setDialog("export");
            }}
            disabled={!pattern || busy}
          >
            <ArrowDownToLine size={17} />
            <span>导出图纸</span>
            <ChevronDown size={15} />
          </button>
          <button
            className="icon-button help-button"
            title="使用帮助"
            aria-label="使用帮助"
            onClick={() => setDialog("help")}
          >
            <HelpCircle size={19} />
          </button>
        </div>
      </header>
      <nav className="mobile-tabs" aria-label="工作区面板">
        {[
          { key: "settings", text: "参数", icon: Settings2 },
          { key: "canvas", text: "图纸", icon: Grid2X2 },
          { key: "palette", text: "色板与用量", icon: PaletteIcon },
        ].map((t) => (
          <button
            key={t.key}
            className={mobileTab === t.key ? "active" : ""}
            onClick={() => setMobileTab(t.key as typeof mobileTab)}
          >
            <t.icon size={17} />
            {t.text}
          </button>
        ))}
      </nav>
      <main className={`workspace mobile-${mobileTab}`}>
        {mobileTab !== "canvas" && (
          <h1 className="mobile-panel-heading">图片转拼豆图纸</h1>
        )}
        <aside className="settings-panel panel" aria-label="图纸参数">
          <div className="panel-title">
            <Settings2 size={17} />
            <h2>图纸设置</h2>
            <span>01</span>
          </div>
          <div className="settings-scroll">
            <section className="control-section">
              <h3>原始图片</h3>
              <button
                className={`upload-zone ${dragging ? "dragging" : ""}`}
                onClick={() => imageInput.current?.click()}
                disabled={busy}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  void upload(e.dataTransfer.files[0]);
                }}
              >
                <span className="upload-icon">
                  <ImagePlus size={24} />
                </span>
                <strong>点击或拖拽上传图片</strong>
                <span>PNG、JPG、WebP · 最大 25 MB</span>
              </button>
              <div className="source-thumb">
                <div className="checker">
                  {source ? (
                    <img src={source} alt="待转换的原图" />
                  ) : (
                    <FileJson size={26} />
                  )}
                </div>
                <div>
                  <strong title={sourceName}>{sourceName}</strong>
                  <span>
                    {image
                      ? `${image.naturalWidth} × ${image.naturalHeight} px`
                      : "重新上传图片可继续转换"}
                  </span>
                </div>
                <button
                  className="icon-button"
                  title="裁剪图片"
                  aria-label="裁剪图片"
                  disabled={!image || busy}
                  onClick={() => setDialog("crop")}
                >
                  <CropIcon size={16} />
                </button>
              </div>
              <div className="sample-links">
                <button
                  className="sample-link"
                  onClick={() => useSample("photo")}
                  disabled={busy}
                >
                  <FileImage size={14} />
                  真实照片
                </button>
                <button
                  className="sample-link"
                  onClick={() => useSample("pixel")}
                  disabled={busy}
                >
                  <Sparkles size={14} />
                  像素插画
                </button>
              </div>
              {source === samples.photo.src && (
                <p className="sample-credit">
                  Don McCulley · CC0 ·{" "}
                  <a
                    href="https://commons.wikimedia.org/wiki/File:Sunflower_Public_Domain.jpg"
                    target="_blank"
                    rel="noreferrer"
                  >
                    照片来源
                  </a>
                </p>
              )}
            </section>
            <section className="control-section">
              <div className="section-heading">
                <h3>图纸尺寸</h3>
                <span>每格 = 1 颗</span>
              </div>
              <div className="preset-row size-presets">
                {[32, 48, 64, 96, 128, 192, 256].map((n) => (
                  <button
                    key={n}
                    className={
                      settings.width === n && settings.height === n
                        ? "active"
                        : ""
                    }
                    disabled={busy}
                    onClick={() =>
                      setSettings((s) => ({ ...s, width: n, height: n }))
                    }
                  >
                    {n} × {n}
                  </button>
                ))}
              </div>
              <div className="dimension-fields">
                <label>
                  宽度 / 列
                  <input
                    aria-label="图纸宽度"
                    type="number"
                    min="1"
                    max="512"
                    value={Number.isNaN(settings.width) ? "" : settings.width}
                    disabled={busy}
                    onChange={(e) =>
                      updateSetting(
                        "width",
                        e.target.value === "" ? NaN : Number(e.target.value),
                      )
                    }
                  />
                </label>
                <span>×</span>
                <label>
                  高度 / 行
                  <input
                    aria-label="图纸高度"
                    type="number"
                    min="1"
                    max="512"
                    value={Number.isNaN(settings.height) ? "" : settings.height}
                    disabled={busy}
                    onChange={(e) =>
                      updateSetting(
                        "height",
                        e.target.value === "" ? NaN : Number(e.target.value),
                      )
                    }
                  />
                </label>
              </div>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={settings.keepRatio}
                  disabled={busy}
                  onChange={(e) => updateSetting("keepRatio", e.target.checked)}
                />
                <span>保持原图比例</span>
                <LockKeyhole size={13} />
              </label>
              <p className={`dimension-hint ${dimensions ? "" : "error-text"}`}>
                {dimensions
                  ? `实际生成 ${dimensions.width} 列 × ${dimensions.height} 行`
                  : "请输入 1–512 的整数尺寸"}
              </p>
              {dimensions && (
                <p className="detail-note">
                  5 mm 拼豆约 {(dimensions.width * 0.5).toFixed(1)} ×{" "}
                  {(dimensions.height * 0.5).toFixed(1)} cm
                  {settings.mode === "photo" &&
                  Math.max(dimensions.width, dimensions.height) < 96
                    ? "；照片建议 96 格以上"
                    : ""}
                </p>
              )}
            </section>
            <section className="control-section photo-controls">
              <h3>照片处理</h3>
              <label className="field-label">
                图像类型
                <select
                  aria-label="图像类型"
                  value={settings.mode}
                  disabled={busy}
                  onChange={(e) =>
                    updateSetting("mode", e.target.value as "photo" | "pixel")
                  }
                >
                  <option value="photo">日常照片 · 区域采样</option>
                  <option value="pixel">像素插画 · 清晰色块</option>
                </select>
              </label>
              {settings.mode === "photo" && (
                <>
                  <label className="field-label">
                    碎色简化
                    <select
                      aria-label="碎色简化"
                      value={settings.smoothing}
                      disabled={busy}
                      onChange={(e) =>
                        updateSetting("smoothing", Number(e.target.value))
                      }
                    >
                      <option value={0}>关闭 · 保留纹理</option>
                      <option value={1}>适中 · 减少噪点</option>
                      <option value={2}>较强 · 简化复杂背景</option>
                    </select>
                  </label>
                  <label className="range-label">
                    轮廓对比 <span>{settings.contrast}%</span>
                    <input
                      aria-label="轮廓对比"
                      type="range"
                      min={0}
                      max={30}
                      step={2}
                      value={settings.contrast}
                      disabled={busy}
                      onChange={(e) =>
                        updateSetting("contrast", Number(e.target.value))
                      }
                    />
                  </label>
                </>
              )}
              <label className="field-label">
                照片背景
                <select
                  aria-label="照片背景"
                  value={settings.removeBackground ? "remove" : "keep"}
                  disabled={busy}
                  onChange={(e) =>
                    updateSetting(
                      "removeBackground",
                      e.target.value === "remove",
                    )
                  }
                >
                  <option value="keep">完整保留背景</option>
                  <option value="remove">去除边缘纯色背景</option>
                </select>
              </label>
              {settings.removeBackground ? (
                <>
                  <label className="range-label">
                    去背景容差 <span>{settings.backgroundTolerance}</span>
                    <input
                      aria-label="去背景容差"
                      type="range"
                      min={2}
                      max={20}
                      value={settings.backgroundTolerance}
                      disabled={busy}
                      onChange={(e) =>
                        updateSetting(
                          "backgroundTolerance",
                          Number(e.target.value),
                        )
                      }
                    />
                  </label>
                  <p className="detail-note">
                    适合纯色纸张、白墙等背景。从边缘去除相近颜色；复杂场景请保留背景并裁剪主体。
                  </p>
                </>
              ) : (
                <p className="detail-note">
                  有背景的照片可直接转换。先裁剪突出主体，或调高碎色简化减少背景纹理。
                </p>
              )}
            </section>
            <section className="control-section">
              <h3>颜色与细节</h3>
              <label className="field-label">
                匹配色板
                <select
                  value={palette.name}
                  disabled={busy}
                  onChange={(e) =>
                    setPalette(palettes.find((p) => p.name === e.target.value)!)
                  }
                >
                  {palettes.map((p, i) => (
                    <option key={`${p.name}-${i}`} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="section-heading little">
                <span>最多使用颜色</span>
                <strong>{settings.maxColors} 色</strong>
              </div>
              <div className="preset-row colors-presets">
                {[8, 16, 24, 32].map((n) => (
                  <button
                    key={n}
                    className={settings.maxColors === n ? "active" : ""}
                    disabled={busy}
                    onClick={() => updateSetting("maxColors", n)}
                  >
                    {n} 色
                  </button>
                ))}
              </div>
              <label className="switch-row">
                <span>
                  抖动效果<small>渐变更平滑，颜色更分散</small>
                </span>
                <input
                  type="checkbox"
                  checked={settings.dither}
                  disabled={busy}
                  onChange={(e) => updateSetting("dither", e.target.checked)}
                />
              </label>
              <label className="field-label">
                透明区域
                <select
                  aria-label="透明区域"
                  value={settings.background ? "fill" : "empty"}
                  disabled={busy}
                  onChange={(e) =>
                    updateSetting(
                      "background",
                      e.target.value === "empty" ? null : "#FFFFFF",
                    )
                  }
                >
                  <option value="empty">留空 · 不放拼豆</option>
                  <option value="fill">使用背景色</option>
                </select>
              </label>
              {settings.background && (
                <label className="background-picker">
                  背景色
                  <input
                    aria-label="背景色"
                    type="color"
                    value={settings.background}
                    disabled={busy}
                    onChange={(e) =>
                      updateSetting("background", e.target.value)
                    }
                  />
                  <span>{settings.background.toUpperCase()}</span>
                </label>
              )}
            </section>
            <div className="privacy-note">
              <LockKeyhole size={15} />
              <span>图片在本机处理，不会上传。</span>
            </div>
          </div>
          <div className="settings-bottom">
            <button
              className="generate-button primary"
              disabled={busy || !image || !dimensions}
              onClick={generate}
            >
              {busy ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <Sparkles size={17} />
              )}
              {busy ? `正在处理 ${progress}%` : "生成拼豆图纸"}
            </button>
            <p className="fine-print">调整参数后点击生成，可撤销恢复原编辑。</p>
          </div>
        </aside>
        <section className="center-panel">
          <div className="canvas-heading">
            <div>
              <div className="eyebrow">我的拼豆作品</div>
              <h1>{pattern?.name ?? "正在准备图纸"}</h1>
            </div>
            <span className="dimension-badge">
              {pattern ? `${pattern.width} × ${pattern.height} 格` : "—"}
            </span>
          </div>
          <div className="canvas-toolbar">
            <div className="tool-group">
              {toolItems.map((t) => (
                <button
                  key={t.key}
                  className={`tool-button ${tool === t.key ? "active" : ""}`}
                  aria-label={`${t.label} (${t.shortcut})`}
                  title={`${t.label} (${t.shortcut})`}
                  disabled={busy}
                  onClick={() => setTool(t.key)}
                >
                  <t.icon size={18} />
                </button>
              ))}
              <i />
              <button
                className="tool-button"
                title="整图颜色替换"
                aria-label="整图颜色替换"
                disabled={!pattern || busy}
                onClick={() => {
                  setReplaceFrom(
                    stats.used.some((c) => c.code === selectedColor.code)
                      ? selectedColor.code
                      : (stats.used[0]?.code ?? "empty"),
                  );
                  setReplaceTo(selectedColor.code);
                  setDialog("replace");
                }}
              >
                <Replace size={18} />
              </button>
            </div>
            <div className="undo-group">
              <button
                className="tool-button"
                title="撤销 Ctrl+Z"
                aria-label="撤销"
                disabled={!history.canUndo || busy}
                onClick={history.undo}
              >
                <Undo2 size={18} />
              </button>
              <button
                className="tool-button"
                title="重做 Ctrl+Shift+Z"
                aria-label="重做"
                disabled={!history.canRedo || busy}
                onClick={history.redo}
              >
                <Redo2 size={18} />
              </button>
            </div>
            <div className="view-toggles">
              {[
                { key: "grid", label: "网格" },
                { key: "codes", label: "色号" },
                { key: "coordinates", label: "坐标" },
              ].map((t) => (
                <label key={t.key}>
                  <input
                    type="checkbox"
                    checked={display[t.key as keyof DisplayOptions]}
                    onChange={(e) =>
                      setDisplay((d) => ({ ...d, [t.key]: e.target.checked }))
                    }
                  />
                  {t.label}
                </label>
              ))}
            </div>
          </div>
          <div className="preview-tabs">
            <button
              className={!compare ? "active" : ""}
              onClick={() => setCompare(false)}
            >
              图纸预览
            </button>
            <button
              className={compare ? "active" : ""}
              disabled={!image}
              onClick={() => setCompare(true)}
            >
              原图对比
            </button>
            <span>
              {highlight ? (
                <button
                  className="highlight-chip"
                  onClick={() => setHighlight(null)}
                >
                  高亮 {highlight}
                  <X size={13} />
                </button>
              ) : (
                <>
                  <span
                    className="mini-swatch"
                    style={{ background: selectedColor.hex }}
                  />
                  {selectedColor.code} ·{" "}
                  {toolItems.find((t) => t.key === tool)?.label}
                </>
              )}
            </span>
          </div>
          <div className={`preview-area ${compare ? "comparing" : ""}`}>
            {compare && (
              <div className="original-preview">
                <span>原始图片</span>
                <div className="checker">
                  <img src={source} alt="原图对比" />
                </div>
                <small>转换使用所选裁剪区域</small>
              </div>
            )}
            {pattern ? (
              <PatternCanvas
                pattern={pattern}
                tool={tool}
                color={selectedColor.code}
                display={display}
                highlight={highlight}
                onCommit={history.commit}
                onPick={(code) => {
                  setSelected(code);
                  setTool("brush");
                  setHighlight(null);
                  notify(`已拾取 ${code}`);
                }}
                onHover={setHover}
                disabled={busy}
              />
            ) : (
              <div className="canvas-empty">
                <LoaderCircle className="spin" />
                <span>正在生成示例图纸…</span>
              </div>
            )}
            {busy && (
              <div className="processing-overlay" role="status">
                <LoaderCircle className="spin" size={28} />
                <strong>正在处理 {progress}%</strong>
                <div>
                  <i style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}
          </div>
          <div className="canvas-footer">
            <span>{hover}</span>
            <span>
              <Hand size={13} />
              移动工具拖动画布 · 滚轮缩放
            </span>
          </div>
          <div className="summary-strip">
            <div>
              <span>拼豆总数</span>
              <strong>
                {stats.total.toLocaleString()}
                <small> 颗</small>
              </strong>
            </div>
            <div>
              <span>实际用色</span>
              <strong>
                {stats.colorCount}
                <small> 色</small>
              </strong>
            </div>
            <div>
              <span>图纸尺寸</span>
              <strong>
                {pattern ? `${pattern.width} × ${pattern.height}` : "—"}
                <small> 格</small>
              </strong>
            </div>
            <div className="blank-summary">
              <span>空白格</span>
              <strong>
                {stats.blank.toLocaleString()}
                <small> 格</small>
              </strong>
            </div>
          </div>
        </section>
        <aside className="palette-panel panel" aria-label="色板与用量">
          <div className="panel-title">
            <PaletteIcon size={18} />
            <h2>色板与用量</h2>
            <span>02</span>
          </div>
          <div className="palette-scroll">
            <div className="palette-info">
              <strong>{editPalette.name}</strong>
              <span>
                {editPalette.source
                  ? "第三方色号对照 · 221 色"
                  : "自定义 / 示例色板"}
                {editPalette.source && (
                  <a
                    href={editPalette.source}
                    target="_blank"
                    rel="noreferrer"
                    title="查看色号来源"
                  >
                    <Info size={14} />
                  </a>
                )}
              </span>
            </div>
            <section className="used-code-overview" aria-label="本图纸所需色号">
              <div className="used-code-heading">
                <h3>
                  本图纸所需色号 <span>{requiredColors.length} 种</span>
                </h3>
                <button
                  className="copy-code-button"
                  title="复制全部所需色号"
                  aria-label="复制全部所需色号"
                  disabled={busy || !requiredColors.length}
                  onClick={copyRequiredCodes}
                >
                  <Copy size={13} />
                  复制
                </button>
              </div>
              {requiredColors.length ? (
                <div className="used-code-list">
                  {requiredColors.map((c) => (
                    <button
                      key={c.code}
                      className={`used-code-chip ${highlight === c.code ? "active" : ""}`}
                      aria-label={`高亮色号 ${c.code}，需要 ${c.count} 颗`}
                      aria-pressed={highlight === c.code}
                      title={`${c.code} · ${c.name} · ${c.count.toLocaleString()} 颗`}
                      disabled={busy}
                      onClick={() => selectColor(c.code)}
                    >
                      <i style={{ background: c.hex }} />
                      <code>{c.code}</code>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="used-code-empty">
                  {busy ? "正在统计所需色号…" : "图纸暂无拼豆，无需准备色号。"}
                </p>
              )}
            </section>
            <div className="palette-tabs">
              <button
                className={paletteTab === "used" ? "active" : ""}
                onClick={() => setPaletteTab("used")}
              >
                已用颜色 <span>{stats.colorCount}</span>
              </button>
              <button
                className={paletteTab === "all" ? "active" : ""}
                onClick={() => setPaletteTab("all")}
              >
                全部色板
              </button>
            </div>
            <input
              className="color-search"
              aria-label="查找颜色"
              placeholder="查找色号、名称或 HEX"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="color-list-head">
              <span>颜色 / 编号</span>
              <span>用量（颗）</span>
            </div>
            <div className="color-list">
              {visibleColors.map((c) => (
                <button
                  className={`color-row ${selected === c.code ? "selected" : ""}`}
                  key={c.code}
                  disabled={busy}
                  onClick={() => selectColor(c.code)}
                  title={`${c.name} ${c.hex}，点击选择并高亮`}
                >
                  <span className="color-swatch" style={{ background: c.hex }}>
                    {selected === c.code && (
                      <Check
                        size={16}
                        style={{
                          color:
                            parseInt(c.hex.slice(1, 3), 16) > 150
                              ? "#173c43"
                              : "white",
                        }}
                      />
                    )}
                  </span>
                  <span className="color-name">
                    <strong>{c.code}</strong>
                    <small>{c.hex}</small>
                  </span>
                  <span className="color-count">
                    {c.count.toLocaleString()}
                  </span>
                </button>
              ))}
              {!visibleColors.length && (
                <div className="empty-colors">
                  {search
                    ? "没有找到匹配颜色"
                    : busy
                      ? "正在统计颜色…"
                      : "图纸为空白，切换到全部色板开始绘制。"}
                </div>
              )}
            </div>
          </div>
          <div className="palette-bottom">
            <p>
              <Info size={14} />
              点击颜色选取画笔，并高亮同色格子。
            </p>
            <div>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => paletteInput.current?.click()}
              >
                <Upload size={14} />
                导入色板
              </button>
              <button
                className="secondary"
                onClick={() =>
                  downloadJSON(
                    editPalette,
                    `${filename(editPalette.name)}.palette.json`,
                  )
                }
              >
                <ArrowDownToLine size={14} />
                导出色板
              </button>
            </div>
            {editPalette.description && (
              <small tabIndex={0}>{editPalette.description}</small>
            )}
          </div>
        </aside>
      </main>
      <input
        id="image-upload"
        ref={imageInput}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(e) => {
          void upload(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        id="palette-import"
        ref={paletteInput}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          void readJSON(e.target.files?.[0], "palette");
          e.target.value = "";
        }}
      />
      <input
        id="project-load"
        ref={projectInput}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          void readJSON(e.target.files?.[0], "project");
          e.target.value = "";
        }}
      />
      {message && (
        <div
          className={`toast ${message.error ? "error" : ""}`}
          role={message.error ? "alert" : "status"}
        >
          {message.error ? <Info size={19} /> : <Check size={19} />}
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} aria-label="关闭提示">
            <X size={16} />
          </button>
        </div>
      )}
      {dialog === "crop" && image && (
        <CropDialog
          image={image}
          initial={crop}
          onClose={() => setDialog(null)}
          onApply={(c) => {
            setCrop(c);
            setDialog(null);
            notify("裁剪区域已保存，点击生成应用。");
          }}
        />
      )}
      {dialog === "export" && pattern && (
        <Modal
          title="导出你的拼豆作品"
          onClose={() => {
            if (!busy) setDialog(null);
          }}
        >
          <p className="modal-description">
            根据图纸原始数据生成高清文件，预览缩放不会影响清晰度。
          </p>
          <div className="export-options">
            {[
              {
                key: "pattern",
                icon: FileImage,
                label: "纯图案 PNG",
                desc: "透明背景，无网格 · 每格 12 px",
              },
              {
                key: "chart",
                icon: Grid2X2,
                label: "制作图纸 PNG",
                desc: "网格、色号、坐标与完整用量 · 每格 24 px",
              },
              {
                key: "pdf",
                icon: FileText,
                label: "A4 打印 PDF",
                desc: "分多页打印，附用量清单、页码和拼接位置",
              },
            ].map((o) => (
              <label
                key={o.key}
                className={exportType === o.key ? "active" : ""}
              >
                <input
                  type="radio"
                  name="export"
                  value={o.key}
                  checked={exportType === o.key}
                  disabled={busy}
                  onChange={() => setExportType(o.key as typeof exportType)}
                />
                <o.icon size={24} />
                <span>
                  <strong>{o.label}</strong>
                  <small>{o.desc}</small>
                </span>
              </label>
            ))}
          </div>
          {exportType === "pdf" && (
            <div className="pdf-settings">
              <label>
                打印每格尺寸
                <select
                  value={beadMm}
                  disabled={busy}
                  onChange={(e) => setBeadMm(Number(e.target.value))}
                >
                  <option value={3}>3 mm / 格</option>
                  <option value={5}>5 mm / 格（常用）</option>
                  <option value={7}>7 mm / 格</option>
                </select>
              </label>
              <p>
                共 {pdfLayout(pattern, beadMm).totalPages} 张 A4，图纸分{" "}
                {pdfLayout(pattern, beadMm).across} 列 ×{" "}
                {pdfLayout(pattern, beadMm).down} 行。
                <br />
                打印请选择「实际大小 / 100%」。
              </p>
            </div>
          )}
          {message?.error && (
            <p className="dialog-error" role="alert">
              {message.text}
            </p>
          )}
          <div className="modal-actions">
            <span>
              {stats.total.toLocaleString()} 颗 · {stats.colorCount} 色
            </span>
            <button className="primary" onClick={handleExport} disabled={busy}>
              {busy ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <ArrowDownToLine size={17} />
              )}{" "}
              {busy ? `导出中 ${progress}%` : "下载文件"}
            </button>
          </div>
        </Modal>
      )}
      {dialog === "replace" && pattern && (
        <Modal title="整图颜色替换" onClose={() => setDialog(null)}>
          <p className="modal-description">
            将图纸中一种颜色的所有格子替换，可通过撤销恢复。
          </p>
          <div className="replace-fields">
            <label>
              原颜色
              <select
                value={replaceFrom}
                onChange={(e) => setReplaceFrom(e.target.value)}
              >
                {stats.used.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} · {c.count} 颗
                  </option>
                ))}
                <option value="empty">空白格</option>
              </select>
            </label>
            <Replace size={20} />
            <label>
              替换为
              <select
                value={replaceTo}
                onChange={(e) => setReplaceTo(e.target.value)}
              >
                {editPalette.colors.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} · {c.name}
                  </option>
                ))}
                <option value="empty">空白 / 擦除</option>
              </select>
            </label>
          </div>
          <div className="modal-actions">
            <button className="secondary" onClick={() => setDialog(null)}>
              取消
            </button>
            <button
              className="primary"
              disabled={replaceFrom === replaceTo}
              onClick={() => {
                history.commit(
                  replaceColor(
                    pattern,
                    replaceFrom === "empty" ? null : replaceFrom,
                    replaceTo === "empty" ? null : replaceTo,
                  ),
                );
                setDialog(null);
                setHighlight(null);
                notify("整图颜色已替换。");
              }}
            >
              替换所有格子
            </button>
          </div>
        </Modal>
      )}
      {dialog === "help" && (
        <Modal title="从图片到拼豆作品" onClose={() => setDialog(null)}>
          <div className="help-content">
            <p>
              1.
              上传图片或使用示例，按需裁剪；选择图纸尺寸、色板和颜色上限，再生成图纸。
            </p>
            <p>
              2. 选择颜色后，用画笔 B、橡皮擦 E、吸管 I 或移动 H 调整图纸。Ctrl
              / ⌘ + Z 撤销，Ctrl / ⌘ + Shift + Z 重做。滚轮缩放。
            </p>
            <p>
              3. 保存项目 JSON
              留存编辑结果；项目包含格子和色板，不包含原始图片。导出 PNG 或 A4
              PDF 用于制作。
            </p>
            <p>色板 JSON 格式：</p>
            <pre>
              {
                '{"name":"我的色板","colors":[\n  {"code":"X01","name":"白色","hex":"#FFFFFF"}\n]}'
              }
            </pre>
            <p>
              通用示例的 S 编号由本工具自定义。Mard
              色号来自你提供的第三方对照页。最多支持 512 × 512 格。
            </p>
            <p>
              照片推荐 128 格 / 32
              色起步。碎色简化减少照片噪点并保留边缘；像素插画模式使用最近邻采样。纯色去背景只处理与边缘连通的相近颜色，不适用于复杂场景的自动主体识别。
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}
