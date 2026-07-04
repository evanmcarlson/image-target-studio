import {useEffect, useMemo, useRef, useState, type CSSProperties} from "react";
import Cropper, {type Area, type Point} from "react-easy-crop";
import {c} from "../theme";
import {
  type CropRegion,
  type VisualRect,
  minVisualSize,
  normalizeVisualRect,
  orientationFeasible,
  renderCropPreview,
  visualToWorking,
} from "../lib/imageCrop";

export type CropperResult = {
  crop: CropRegion;
  visualRect: VisualRect;
  previewUrl: string;
};

export function CropperModal({
  imgUrl,
  naturalSize,
  initialIsRotated,
  initialVisualRect,
  onApply,
  onCancel,
}: {
  imgUrl: string;
  naturalSize: {w: number; h: number};
  initialIsRotated: boolean;
  initialVisualRect?: VisualRect | null;
  onApply: (result: CropperResult) => void;
  onCancel: () => void;
}) {
  const [isRotated, setIsRotated] = useState(initialIsRotated);
  const [crop, setCrop] = useState<Point>({x: 0, y: 0});
  const [zoom, setZoom] = useState(1);
  const [applying, setApplying] = useState(false);
  const areaRef = useRef<Area | null>(null);

  const aspect = isRotated ? 4 / 3 : 3 / 4;
  const canRotate = orientationFeasible(naturalSize.w, naturalSize.h, !isRotated);

  const maxZoom = useMemo(() => {
    const maxVisualWidth = Math.min(naturalSize.w, naturalSize.h * aspect);
    return Math.max(1, maxVisualWidth / minVisualSize(isRotated).width);
  }, [naturalSize, aspect, isRotated]);

  const seedRect = useMemo(() => {
    if (!initialVisualRect) return undefined;
    return normalizeVisualRect(initialVisualRect, naturalSize.w, naturalSize.h, isRotated);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", handleKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onCancel]);

  function rotate() {
    if (!canRotate) return;
    setIsRotated((r) => !r);
    setCrop({x: 0, y: 0});
    setZoom(1);
    areaRef.current = null;
  }

  async function apply() {
    const area = areaRef.current;
    if (!area || applying) return;
    setApplying(true);
    try {
      const visualRect = normalizeVisualRect(area, naturalSize.w, naturalSize.h, isRotated);
      const region = visualToWorking(visualRect, naturalSize.w, naturalSize.h, isRotated);
      const previewUrl = await renderCropPreview(imgUrl, visualRect);
      onApply({crop: region, visualRect, previewUrl});
    } finally {
      setApplying(false);
    }
  }

  const zoomStep = Math.max(0.01, (maxZoom - 1) / 100);
  const nudgeZoom = (dir: 1 | -1) =>
    setZoom((z) => Math.max(1, Math.min(maxZoom, z + dir * Math.max(0.1, (maxZoom - 1) / 8))));

  return (
    <div style={overlayStyle}>
      <div role="dialog" aria-modal="true" aria-label="Crop image target" style={panelStyle}>
        <div style={headerStyle}>
          <h2 style={titleStyle}>Crop Image Target</h2>
          <button type="button" onClick={onCancel} style={closeStyle} className="btn-secondary" aria-label="Cancel and close">
            <XIcon />
          </button>
        </div>

        <div style={stageStyle}>
          <Cropper
            image={imgUrl}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            minZoom={1}
            maxZoom={maxZoom}
            zoomSpeed={0.4}
            initialCroppedAreaPixels={seedRect}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={(_area, areaPixels) => { areaRef.current = areaPixels; }}
            showGrid
            style={{
              containerStyle: {background: "#101013"},
              cropAreaStyle: {border: "1.5px solid rgba(255,255,255,0.85)", borderRadius: 2},
            }}
          />
          <button
            type="button"
            onClick={rotate}
            disabled={!canRotate}
            className="its-crop-rotate-btn"
            style={rotateBtnStyle}
            aria-label={`Rotate crop to ${isRotated ? "portrait" : "landscape"}`}
            title={canRotate
              ? `Rotate crop to ${isRotated ? "portrait" : "landscape"}`
              : `Image too small for a ${isRotated ? "portrait" : "landscape"} crop`}
          >
            <RotateIcon />
          </button>
          <span style={orientationChipStyle}>
            {isRotated ? "Landscape · 4:3" : "Portrait · 3:4"}
          </span>
        </div>

        <div style={zoomRowStyle}>
          <button type="button" onClick={() => nudgeZoom(-1)} disabled={maxZoom === 1} style={zoomNudgeStyle} aria-label="Zoom out">
            <ZoomOutIcon />
          </button>
          <input
            type="range"
            className="its-zoom-slider"
            min={1}
            max={maxZoom}
            step={zoomStep}
            value={zoom}
            disabled={maxZoom === 1}
            onChange={(e) => setZoom(Number(e.target.value))}
            aria-label="Zoom"
          />
          <button type="button" onClick={() => nudgeZoom(1)} disabled={maxZoom === 1} style={zoomNudgeStyle} aria-label="Zoom in">
            <ZoomInIcon />
          </button>
        </div>
        <p style={hintStyle}>Drag to reposition · pinch or slide to zoom</p>

        <div style={footerStyle}>
          <button type="button" onClick={onCancel} className="btn-secondary" style={cancelBtnStyle}>
            Cancel
          </button>
          <button type="button" onClick={apply} disabled={applying} className="btn-primary" style={applyBtnStyle}>
            {applying ? "Applying…" : "Apply Crop"}
          </button>
        </div>
      </div>
    </div>
  );
}

function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function RotateIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
    </svg>
  );
}

function ZoomOutIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="8" y1="11" x2="14" y2="11" />
    </svg>
  );
}

function ZoomInIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="8" y1="11" x2="14" y2="11" /><line x1="11" y1="8" x2="11" y2="14" />
    </svg>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0, 0, 0, 0.35)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
  backdropFilter: "blur(2px)",
  WebkitBackdropFilter: "blur(2px)",
  padding: 16,
};

const panelStyle: CSSProperties = {
  background: c.surface,
  borderRadius: 16,
  width: "100%",
  maxWidth: 560,
  boxShadow: "0 20px 60px rgba(0,0,0,0.2), 0 4px 16px rgba(0,0,0,0.1)",
  overflow: "hidden",
  border: `1px solid ${c.border}`,
  display: "flex",
  flexDirection: "column",
};

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "16px 20px 12px",
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 17,
  fontWeight: 700,
  color: c.text,
  letterSpacing: "-0.01em",
};

const closeStyle: CSSProperties = {
  background: c.fill,
  border: "none",
  borderRadius: 8,
  width: 32,
  height: 32,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  color: c.textSec,
  flexShrink: 0,
};

const stageStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  height: "min(56vh, 440px)",
  minHeight: 300,
  background: "#101013",
  touchAction: "none",
};

const rotateBtnStyle: CSSProperties = {
  position: "absolute",
  top: 12,
  right: 12,
  zIndex: 5,
  width: 36,
  height: 36,
  borderRadius: "50%",
  border: "1px solid rgba(255,255,255,0.28)",
  background: "rgba(20,20,24,0.62)",
  color: "#fff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  backdropFilter: "blur(6px)",
  WebkitBackdropFilter: "blur(6px)",
};

const orientationChipStyle: CSSProperties = {
  position: "absolute",
  bottom: 12,
  left: 12,
  zIndex: 5,
  padding: "4px 10px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.02em",
  color: "rgba(255,255,255,0.92)",
  background: "rgba(20,20,24,0.62)",
  border: "1px solid rgba(255,255,255,0.18)",
  pointerEvents: "none",
  backdropFilter: "blur(6px)",
  WebkitBackdropFilter: "blur(6px)",
};

const zoomRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "16px 20px 0",
};

const zoomNudgeStyle: CSSProperties = {
  background: "none",
  border: "none",
  padding: 4,
  display: "flex",
  alignItems: "center",
  color: c.textSec,
  cursor: "pointer",
};

const hintStyle: CSSProperties = {
  margin: "8px 20px 0",
  fontSize: 12,
  color: c.textMuted,
  textAlign: "center",
};

const footerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 10,
  padding: "16px 20px 20px",
};

const cancelBtnStyle: CSSProperties = {
  background: c.fill,
  border: "none",
  borderRadius: 10,
  padding: "10px 18px",
  fontWeight: 600,
  fontSize: 14,
  cursor: "pointer",
  color: c.textSec,
  fontFamily: "inherit",
};

const applyBtnStyle: CSSProperties = {
  background: c.accent,
  color: c.accentText,
  border: "none",
  borderRadius: 10,
  padding: "10px 20px",
  fontWeight: 600,
  fontSize: 14,
  cursor: "pointer",
  boxShadow: c.shadow,
};
