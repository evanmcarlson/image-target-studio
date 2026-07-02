import {useEffect, useRef, useState} from "react";
import {c} from "../theme";
import type {CropRegion} from "../lib/imageCrop";

export function CropPreview({
  imgUrl,
  crop,
  naturalSize,
  cropOffset,
  onOffsetChange,
}: {
  imgUrl: string;
  crop: CropRegion | null;
  naturalSize: {w: number; h: number} | null;
  cropOffset?: {x: number; y: number};
  onOffsetChange?: (offset: {x: number; y: number}) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef   = useRef<{startX: number; startY: number; startOffset: {x: number; y: number}} | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imgUrl) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      if (crop?.isRotated) {
        canvas.width  = img.naturalHeight;
        canvas.height = img.naturalWidth;
        ctx.save();
        ctx.translate(img.naturalHeight, 0);
        ctx.rotate(Math.PI / 2);
        ctx.drawImage(img, 0, 0);
        ctx.restore();
      } else {
        canvas.width  = img.naturalWidth;
        canvas.height = img.naturalHeight;
        ctx.drawImage(img, 0, 0);
      }
    };
    img.src = imgUrl;
  }, [imgUrl, crop?.isRotated]);

  const canPan = !!(onOffsetChange && crop && naturalSize &&
    (naturalSize.w > crop.width || naturalSize.h > crop.height));

  function handleMouseDown(e: React.MouseEvent) {
    if (!canPan || !cropOffset) return;
    e.preventDefault();
    dragRef.current = {startX: e.clientX, startY: e.clientY, startOffset: {...cropOffset}};
    setIsDragging(true);

    function onMove(ev: MouseEvent) {
      const drag = dragRef.current;
      if (!drag || !canvasRef.current) return;
      const scale = canvasRef.current.width / canvasRef.current.offsetWidth;
      const dx = ev.clientX - drag.startX;
      const dy = ev.clientY - drag.startY;
      const newOffset = crop?.isRotated
        ? {x: drag.startOffset.x - dy * scale, y: drag.startOffset.y + dx * scale}
        : {x: drag.startOffset.x + dx * scale, y: drag.startOffset.y + dy * scale};
      onOffsetChange?.(newOffset);
    }

    function onUp() {
      dragRef.current = null;
      setIsDragging(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  const GHOST = "rgba(0,0,0,0.52)";
  const pct = crop && naturalSize ? {
    left:   (crop.left   / naturalSize.w) * 100,
    top:    (crop.top    / naturalSize.h) * 100,
    width:  (crop.width  / naturalSize.w) * 100,
    height: (crop.height / naturalSize.h) * 100,
  } : null;
  const right  = pct ? 100 - pct.left - pct.width  : 0;
  const bottom = pct ? 100 - pct.top  - pct.height : 0;
  const cursor = canPan ? (isDragging ? "grabbing" : "grab") : undefined;

  const canvasAndOverlays = (
    <>
      <canvas ref={canvasRef} style={{width: "100%", display: "block"}} />
      {pct && (
        <>
          {pct.left > 0 && <div style={{position: "absolute", inset: 0, width: `${pct.left}%`, background: GHOST}} />}
          {right > 0    && <div style={{position: "absolute", inset: 0, left: "auto", width: `${right}%`, background: GHOST}} />}
          {pct.top > 0  && <div style={{position: "absolute", left: `${pct.left}%`, width: `${pct.width}%`, top: 0, height: `${pct.top}%`, background: GHOST}} />}
          {bottom > 0   && <div style={{position: "absolute", left: `${pct.left}%`, width: `${pct.width}%`, bottom: 0, height: `${bottom}%`, background: GHOST}} />}
          <div style={{
            position: "absolute",
            left: `${pct.left}%`, top: `${pct.top}%`,
            width: `${pct.width}%`, height: `${pct.height}%`,
            border: "1.5px solid rgba(255,255,255,0.75)",
            boxSizing: "border-box", pointerEvents: "none",
          }} />
        </>
      )}
    </>
  );

  if (crop?.isRotated && naturalSize) {
    const r = naturalSize.w / naturalSize.h;
    return (
      <div onMouseDown={handleMouseDown} style={{
        position: "relative", width: "100%", paddingBottom: `${r * 100}%`,
        borderRadius: 10, overflow: "hidden", border: `1px solid ${c.border}`, cursor,
      }}>
        <div style={{
          position: "absolute", lineHeight: 0,
          width: `${r * 100}%`, height: `${100 / r}%`,
          top: `${(r - 1) / (2 * r) * 100}%`, left: `${(1 - r) / 2 * 100}%`,
          transform: "rotate(-90deg)", transformOrigin: "center center",
        }}>
          {canvasAndOverlays}
        </div>
      </div>
    );
  }

  return (
    <div onMouseDown={handleMouseDown} style={{
      position: "relative", lineHeight: 0,
      borderRadius: 10, overflow: "hidden", border: `1px solid ${c.border}`, cursor,
    }}>
      {canvasAndOverlays}
    </div>
  );
}

export function OrientationToggle({isRotated, autoRotated, onChange}: {
  isRotated: boolean;
  autoRotated: boolean;
  onChange: (v: boolean) => void;
}) {
  const options = [
    {value: false, label: "Portrait",  icon: <PortraitIcon />},
    {value: true,  label: "Landscape", icon: <LandscapeIcon />},
  ] as const;

  return (
    <div style={{display: "flex", gap: 6}}>
      {options.map(({value, label, icon}) => {
        const active      = isRotated === value;
        const recommended = autoRotated === value;
        return (
          <div key={label} style={{display: "flex", flexDirection: "column", alignItems: "center", gap: 3}}>
            <button
              type="button"
              onClick={() => onChange(value)}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "5px 10px", borderRadius: 7,
                border: `1px solid ${active ? c.accent : c.border}`,
                background: active ? c.accent : c.fill,
                color: active ? c.accentText : c.textSec,
                cursor: "pointer", fontSize: 12, fontWeight: 500, fontFamily: "inherit",
                transition: "background 0.15s, color 0.15s, border-color 0.15s",
              }}
            >
              {icon}{label}
            </button>
            {recommended && (
              <span style={{fontSize: 10, fontWeight: 600, color: c.success}}>Recommended</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PortraitIcon()  { return <svg width="10" height="13" viewBox="0 0 10 13" fill="none"><rect x="1" y="1" width="8" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5"/></svg>; }
function LandscapeIcon() { return <svg width="13" height="10" viewBox="0 0 13 10" fill="none"><rect x="1" y="1" width="11" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5"/></svg>; }
