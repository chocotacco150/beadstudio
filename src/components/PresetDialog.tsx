import { useEffect, useState } from "react";
import { Check, LoaderCircle } from "lucide-react";
import type { ConvertSettings, Crop, Palette, Pattern } from "../core/types";
import { conversionPresets, presetSettings } from "../core/presets";
import { convertImage } from "../core/sampling";
import { getStats } from "../core/pattern";
import { Modal } from "./Modal";
import { PatternThumbnail } from "./PatternThumbnail";

export function PresetDialog({ image, crop, settings, palette, onApply, onClose }: {
  image: HTMLImageElement; crop: Crop; settings: ConvertSettings; palette: Palette;
  onApply: (mode: ConvertSettings["mode"]) => void; onClose: () => void;
}) {
  const [results, setResults] = useState<Partial<Record<ConvertSettings["mode"], Pattern>>>({});
  const [errors, setErrors] = useState<Partial<Record<ConvertSettings["mode"], string>>>({});
  const [selected, setSelected] = useState(settings.mode);
  useEffect(() => {
    let active = true;
    const ratio = Math.min(1, 96 / Math.max(settings.width, settings.height));
    void (async () => {
      for (const preset of conversionPresets) {
        if (!active) break;
        const next = presetSettings(settings, preset.id);
        try {
          const p = await convertImage(image, crop, { ...next, width: Math.max(1, Math.round(settings.width * ratio)), height: Math.max(1, Math.round(settings.height * ratio)) }, palette, preset.name, () => {});
          if (active) setResults((r) => ({ ...r, [preset.id]: p }));
        } catch (e) {
          if (active) setErrors((r) => ({ ...r, [preset.id]: e instanceof Error ? e.message : "预览失败" }));
        }
      }
    })();
    return () => { active = false; };
  }, [image, crop, settings, palette]);
  return <Modal title="选一张更适合制作的图纸" onClose={onClose} wide>
    <p className="modal-description">同一裁剪区域、同一色板，比较四种处理方式。缩略预览最长 96 格；应用后按你设置的完整尺寸重新生成。</p>
    <div className="style-preview-grid">
      {conversionPresets.map((p) => {
        const result = results[p.id], stats = result ? getStats(result) : null;
        return <button key={p.id} className={`style-preview-card ${selected === p.id ? "active" : ""}`} aria-pressed={selected === p.id} onClick={() => setSelected(p.id)}>
          {result ? <PatternThumbnail pattern={result} label={`${p.name}转换预览`} /> : <div className="preview-loading">{errors[p.id] ? <span>{errors[p.id]}</span> : <><LoaderCircle className="spin" size={22} /><span>正在生成预览</span></>}</div>}
          <span className="style-preview-title"><strong>{p.name}</strong>{selected === p.id && <Check size={16} />}</span>
          <span className="style-preview-meta">{stats ? `${stats.colorCount} 色 · ${stats.total.toLocaleString()} 颗` : p.short}</span>
        </button>;
      })}
    </div>
    <p className="preset-description">{conversionPresets.find((p) => p.id === selected)!.description}</p>
    <div className="modal-actions"><button className="secondary" onClick={onClose}>返回编辑</button><button className="primary" disabled={!results[selected]} onClick={() => onApply(selected)}>应用{conversionPresets.find((p) => p.id === selected)!.name}</button></div>
  </Modal>;
}
