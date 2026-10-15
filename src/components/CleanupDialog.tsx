import { useMemo, useState } from "react";
import type { Pattern } from "../core/types";
import { cleanSpeckles, mergeRareColors } from "../core/editing";
import { getStats } from "../core/pattern";
import { Modal } from "./Modal";
import { PatternThumbnail } from "./PatternThumbnail";

export function CleanupDialog({ pattern, selected, onApply, onClose }: { pattern: Pattern; selected: string; onApply: (p: Pattern) => void; onClose: () => void }) {
  const [mode, setMode] = useState<"speckles" | "colors">("speckles");
  const [size, setSize] = useState(1), [maxCount, setMaxCount] = useState(5);
  const [protect, setProtect] = useState(true), [mark, setMark] = useState(false);
  const preview = useMemo(() => (mode === "speckles" ? cleanSpeckles : mergeRareColors)(pattern, mode === "speckles" ? size : maxCount, protect ? [selected] : []), [pattern, mode, size, maxCount, protect, selected]);
  const changed = preview.cells.reduce((n, c, i) => n + Number(c !== pattern.cells[i]), 0);
  const before = getStats(pattern), after = getStats(preview);
  return <Modal title="清理杂点与精简色号" onClose={onClose} wide>
    <p className="modal-description">先查看改动，再应用到图纸。清理使用现有色号，可通过撤销恢复。</p>
    <div className="cleanup-controls">
      <div className="segmented-control"><button className={mode === "speckles" ? "active" : ""} onClick={() => setMode("speckles")}>清理小杂点</button><button className={mode === "colors" ? "active" : ""} onClick={() => setMode("colors")}>合并少量色号</button></div>
      <label className="range-label">{mode === "speckles" ? "小色块上限" : "色号用量上限"}<span>{mode === "speckles" ? size : maxCount} 颗</span><input aria-label={mode === "speckles" ? "小色块上限" : "色号用量上限"} type="range" min={1} max={mode === "speckles" ? 5 : 30} value={mode === "speckles" ? size : maxCount} onChange={(e) => mode === "speckles" ? setSize(Number(e.target.value)) : setMaxCount(Number(e.target.value))} /></label>
      <p className="detail-note">{mode === "speckles" ? "合并被其他颜色包围的小色块，保留接触空白区的边缘和独立图案。眼睛、文字等小细节也可能被调整，请对照预览。" : "把少量使用的色号合并到本图已用的相近颜色；色差较大的颜色会保留。不会把豆子变成空白。"}</p>
      <div className="cleanup-checks"><label className="check-row"><input type="checkbox" checked={protect} onChange={(e) => setProtect(e.target.checked)} />保护选中色号 {selected}</label><label className="check-row"><input type="checkbox" checked={mark} onChange={(e) => setMark(e.target.checked)} />用粉色标记改动</label></div>
    </div>
    <div className="cleanup-previews"><div><span>清理前 · {before.colorCount} 色</span><PatternThumbnail pattern={pattern} label="清理前图纸" /></div><div><span>清理后 · {after.colorCount} 色</span><PatternThumbnail pattern={preview} original={pattern} markChanges={mark} label="清理后图纸预览" /></div></div>
    <div className="modal-actions"><span role="status">将调整 {changed.toLocaleString()} 格，减少 {before.colorCount - after.colorCount} 种色号</span><button className="primary" disabled={!changed} onClick={() => onApply(preview)}>应用清理</button></div>
  </Modal>;
}
