import { useEffect, useRef, useState } from "react";
import type { Crop } from "../core/types";
import { fullCrop } from "../core/sampling";
import { Modal } from "./Modal";
export function CropDialog({
  image,
  initial,
  onApply,
  onClose,
}: {
  image: HTMLImageElement;
  initial: Crop;
  onApply: (c: Crop) => void;
  onClose: () => void;
}) {
  const [crop, setCrop] = useState(initial),
    canvasRef = useRef<HTMLCanvasElement>(null),
    start = useRef<{ x: number; y: number } | null>(null);
  const width = 600,
    height = (600 * image.naturalHeight) / image.naturalWidth;
  useEffect(() => {
    const canvas = canvasRef.current!,
      ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);
    ctx.fillStyle = "rgba(13,35,40,.5)";
    ctx.fillRect(0, 0, width, height);
    ctx.save();
    ctx.beginPath();
    ctx.rect(
      crop.x * width,
      crop.y * height,
      crop.width * width,
      crop.height * height,
    );
    ctx.clip();
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);
    ctx.restore();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.strokeRect(
      crop.x * width,
      crop.y * height,
      crop.width * width,
      crop.height * height,
    );
  }, [image, crop, width, height]);
  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
    };
  };
  return (
    <Modal title="裁剪图片" onClose={onClose} wide>
      <p className="modal-description">
        拖动选取需要保留的区域。未裁剪时使用完整原图。
      </p>
      <div className="crop-surface checker">
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          onPointerDown={(e) => {
            start.current = point(e);
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!start.current) return;
            const p = point(e),
              s = start.current;
            setCrop({
              x: Math.min(s.x, p.x),
              y: Math.min(s.y, p.y),
              width: Math.max(0.01, Math.abs(p.x - s.x)),
              height: Math.max(0.01, Math.abs(p.y - s.y)),
            });
          }}
          onPointerUp={() => {
            start.current = null;
          }}
          onPointerCancel={() => {
            start.current = null;
          }}
        />
      </div>
      <div className="crop-fields">
        {(["x", "y", "width", "height"] as const).map((key, i) => (
          <label key={key}>
            {["左侧", "顶部", "宽度", "高度"][i]} %
            <input
              type="number"
              min={key === "width" || key === "height" ? 1 : 0}
              max={100}
              value={Math.round(crop[key] * 100)}
              onChange={(e) => {
                const v = Math.max(
                  key === "width" || key === "height" ? 0.01 : 0,
                  Math.min(1, Number(e.target.value) / 100),
                );
                setCrop((c) => {
                  const next = { ...c, [key]: v };
                  next.width = Math.min(next.width, 1 - next.x);
                  next.height = Math.min(next.height, 1 - next.y);
                  next.x = Math.min(next.x, 0.99);
                  next.y = Math.min(next.y, 0.99);
                  next.width = Math.max(0.01, Math.min(next.width, 1 - next.x));
                  next.height = Math.max(
                    0.01,
                    Math.min(next.height, 1 - next.y),
                  );
                  return next;
                });
              }}
            />
          </label>
        ))}
      </div>
      <div className="modal-actions">
        <button className="secondary" onClick={() => setCrop(fullCrop)}>
          恢复完整图片
        </button>
        <button className="primary" onClick={() => onApply(crop)}>
          应用裁剪
        </button>
      </div>
    </Modal>
  );
}
