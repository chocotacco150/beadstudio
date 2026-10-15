import { useMemo, useState } from "react";
import type { Palette } from "../core/types";
import { Modal } from "./Modal";

export function PaletteDialog({ palette, onApply, onClose }: { palette: Palette; onApply: (p: Palette) => void; onClose: () => void }) {
  const [chosen, setChosen] = useState(() => new Set(palette.colors.map((c) => c.code))), [search, setSearch] = useState("");
  const visible = useMemo(() => palette.colors.filter((c) => `${c.code} ${c.name} ${c.hex}`.toLowerCase().includes(search.trim().toLowerCase())), [palette, search]);
  return <Modal title="只用我有的色号" onClose={onClose} wide>
    <p className="modal-description">从「{palette.name}」勾选手头有的颜色。保存后作为新的匹配色板，下次生成图纸时只使用这些色号。</p>
    <div className="palette-provenance"><strong>色值来源</strong><p>{palette.description ?? "用户提供的自定义色板。"}</p>{palette.source && <a href={palette.source} target="_blank" rel="noreferrer">查看来源与色号对照 ↗</a>}</div>
    <div className="palette-pick-toolbar"><input aria-label="筛选可用色号" placeholder="搜索色号或 HEX" value={search} onChange={(e) => setSearch(e.target.value)} /><button className="secondary" onClick={() => setChosen((s) => new Set([...s, ...visible.map((c) => c.code)]))}>选中筛选结果</button><button className="secondary" onClick={() => setChosen((s) => new Set([...s].filter((c) => !visible.some((v) => v.code === c))))}>取消筛选结果</button></div>
    <div className="palette-pick-grid">{visible.map((c) => <label key={c.code} className={chosen.has(c.code) ? "active" : ""}><input type="checkbox" aria-label={`可用色号 ${c.code}`} checked={chosen.has(c.code)} onChange={(e) => setChosen((s) => { const next = new Set(s); if (e.target.checked) next.add(c.code); else next.delete(c.code); return next; })} /><i style={{ background: c.hex }} /><span>{c.code}</span><small>{c.hex}</small></label>)}{!visible.length && <p>没有匹配的色号。</p>}</div>
    <div className="modal-actions"><span>已选 {chosen.size} / {palette.colors.length} 色</span><button className="primary" disabled={!chosen.size} onClick={() => onApply({ ...palette, name: `${palette.name.replace(/ · 自选 \d+ 色$/, "")} · 自选 ${chosen.size} 色`, description: `${palette.description ?? "用户自定义色板。"}\n从参考色板中手动选择可用色号，不代表任何品牌销售套装。`, colors: palette.colors.filter((c) => chosen.has(c.code)) })}>保存自选色板</button></div>
  </Modal>;
}
