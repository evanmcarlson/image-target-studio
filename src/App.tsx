import {useEffect, useRef, useState, type CSSProperties, type FormEvent} from "react";
import {c} from "./theme";
import {defaultFeasibleRotation, orientationFeasible} from "./lib/imageCrop";
import {generateTarget, downloadZip, type GeneratedTarget} from "./lib/generateTarget";
import {CropperModal, type CropperResult} from "./components/CropperModal";
import {ARTestOverlay, xr8Started} from "./components/ARTestOverlay";

type Phase = "upload" | "configure" | "results";

export function App() {
  const [phase, setPhase]             = useState<Phase>("upload");
  const [file, setFile]               = useState<File | null>(null);
  const [imgUrl, setImgUrl]           = useState("");
  const [naturalSize, setNaturalSize] = useState<{w: number; h: number} | null>(null);
  const [applied, setApplied]         = useState<CropperResult | null>(null);
  const [cropperOpen, setCropperOpen] = useState(false);
  const [name, setName]               = useState("");
  const [generating, setGenerating]   = useState(false);
  const [result, setResult]           = useState<GeneratedTarget | null>(null);
  const [error, setError]             = useState<string | null>(null);
  const [draggingOver, setDraggingOver] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showTarget, setShowTarget]   = useState(false);
  const [arActivated, setArActivated] = useState(false);
  const [showAR, setShowAR]           = useState(false);
  const fileInputRef                  = useRef<HTMLInputElement>(null);

  const dimensionError = naturalSize &&
    !orientationFeasible(naturalSize.w, naturalSize.h, false) &&
    !orientationFeasible(naturalSize.w, naturalSize.h, true)
    ? `Image too small (${naturalSize.w} × ${naturalSize.h} px). Minimum 480 × 640 px.`
    : null;

  useEffect(() => {
    if (!file) return;
    setApplied(null);
    const url = URL.createObjectURL(file);
    setImgUrl(url);
    const img = new Image();
    img.onload = () => {
      const {naturalWidth: w, naturalHeight: h} = img;
      setNaturalSize({w, h});
      if (orientationFeasible(w, h, false) || orientationFeasible(w, h, true)) {
        setCropperOpen(true);
      }
    };
    img.src = url;
    if (!name) setName(file.name.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-"));
    setPhase("configure");
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function handleFile(f: File) {
    setResult(null);
    setError(null);
    setFile(f);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDraggingOver(false);
    const f = e.dataTransfer.files[0];
    if (f?.type.startsWith("image/")) handleFile(f);
  }

  async function handleGenerate(e: FormEvent) {
    e.preventDefault();
    if (!applied || !imgUrl || !name.trim()) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await generateTarget(imgUrl, applied.crop, name.trim());
      setResult(res);
      setPhase("results");
      setShowDetails(true);
      setShowTarget(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  function handleTestInAR() {
    if (xr8Started) {
      // XR8 can only initialize once per page load; reload to test a different target
      window.location.reload();
      return;
    }
    setArActivated(true);
    setShowAR(true);
  }

  function handleStartOver() {
    if (arActivated) {
      // XR8 is running and can't be stopped; page reload resets all state cleanly
      window.location.reload();
      return;
    }
    setFile(null);
    setImgUrl("");
    setNaturalSize(null);
    setApplied(null);
    setCropperOpen(false);
    setName("");
    setResult(null);
    setError(null);
    setShowDetails(false);
    setShowTarget(false);
    setPhase("upload");
  }

  return (
    <div style={{minHeight: "100vh", background: c.bg}}>

      {/* ── Header ── */}
      <header style={{
        position: "sticky", top: 0, zIndex: 50,
        background: "var(--header-bg)",
        borderBottom: "1px solid var(--header-border)",
        backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
      }}>
        <div style={{maxWidth: 860, margin: "0 auto", padding: "0 28px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 56}}>
          <div>
            <span style={{fontSize: 16, fontWeight: 700, color: c.text, letterSpacing: "-0.01em"}}>
              Image Target Studio
            </span>
            <span style={{marginLeft: 10, fontSize: 12, color: c.textMuted}}>8th Wall · client-side pipeline</span>
          </div>
          {phase !== "upload" && (
            <button onClick={handleStartOver} className="btn-secondary" style={ghostBtnStyle}>
              Start over
            </button>
          )}
        </div>
      </header>

      <div style={{maxWidth: 860, margin: "0 auto", padding: "32px 28px 72px"}}>

        {/* ── Upload ── */}
        {phase === "upload" && (
          <>
            <h1 style={pageTitleStyle}>Generate Image Target</h1>
            <p style={pageDescStyle}>Upload a photo to crop, orient, and export an 8th Wall-compatible image target package.</p>
            <input ref={fileInputRef} type="file" accept="image/*" style={{display: "none"}}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            <div
              className={`file-zone${draggingOver ? " drag-over" : ""}`}
              onDragOver={e => { e.preventDefault(); setDraggingOver(true); }}
              onDragLeave={() => setDraggingOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{maxWidth: 520}}
            >
              <UploadIcon />
              <p style={{margin: "12px 0 4px", fontWeight: 600, fontSize: 15, color: c.text}}>
                Drop an image here, or click to choose
              </p>
              <p style={{margin: 0, fontSize: 13, color: c.textMuted}}>PNG, JPEG, or WebP · minimum 480 × 640 px</p>
            </div>
          </>
        )}

        {/* ── Configure ── */}
        {phase === "configure" && imgUrl && (
          <>
            <h1 style={pageTitleStyle}>Configure Target</h1>
            <p style={pageDescStyle}>
              {applied ? "Adjust the crop or change image. Then generate your target." : "Choose an image to get started."}
            </p>

            <div style={{display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap"}}>
              {/* Crop preview card */}
              <div style={{flex: "1 1 260px", maxWidth: 400}}>
                <div style={cardStyle}>
                  <p style={sectionLabelStyle}>Image Target</p>

                  {dimensionError && (
                    <div style={errorBoxStyle}>{dimensionError}</div>
                  )}

                  {applied && !dimensionError ? (
                    <div>
                      <img
                        src={applied.previewUrl}
                        alt="Cropped preview"
                        style={{
                          width: "100%",
                          display: "block",
                          borderRadius: 10,
                          border: `1px solid ${c.border}`,
                          aspectRatio: applied.crop.isRotated ? "4 / 3" : "3 / 4",
                          objectFit: "cover",
                        }}
                      />
                      <div style={{marginTop: 10, display: "flex", alignItems: "center", gap: 8}}>
                        <button type="button" onClick={() => setCropperOpen(true)} style={adjustCropBtnStyle}>
                          <CropIcon /> Adjust Crop
                        </button>
                        <label htmlFor="its-file-input" style={{marginLeft: "auto", fontSize: 12, color: c.accent, cursor: "pointer", fontWeight: 500}}>
                          Change image
                        </label>
                      </div>
                    </div>
                  ) : !dimensionError ? (
                    <label htmlFor="its-file-input" className="file-zone" style={{padding: "32px 16px"}}>
                      <UploadIcon />
                      <p style={{margin: "8px 0 0", fontSize: 13, fontWeight: 500, color: c.text}}>Choose an image</p>
                    </label>
                  ) : (
                    <label htmlFor="its-file-input" className="file-zone" style={{padding: "24px 16px", marginTop: 12}}>
                      <p style={{margin: 0, fontSize: 13, fontWeight: 500, color: c.accent}}>Choose a different image</p>
                    </label>
                  )}

                  <input
                    id="its-file-input"
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    style={{display: "none"}}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                  />
                </div>
              </div>

              {/* Settings card */}
              <div style={{flex: "1 1 220px", maxWidth: 340}}>
                <div style={cardStyle}>
                  <form onSubmit={handleGenerate} style={{display: "flex", flexDirection: "column", gap: 20}}>
                    <div>
                      <label style={labelStyle} htmlFor="target-name">Name</label>
                      <p style={{margin: "2px 0 8px", fontSize: 12, color: c.textMuted}}>
                        Filename prefix in the downloaded zip.
                      </p>
                      <input id="target-name" className="its-input" value={name}
                        onChange={e => setName(e.target.value)} placeholder="my-image-target" />
                    </div>

                    {applied && !dimensionError && (
                      <div style={{...infoCardStyle, borderRadius: 10}}>
                        <InfoRows rows={[
                          {label: "Orientation", value: applied.crop.isRotated ? "Landscape" : "Portrait"},
                          {label: "Crop size",   value: `${applied.crop.width} × ${applied.crop.height} px`},
                          {label: "Offset",      value: `${applied.crop.left}, ${applied.crop.top}`},
                          {label: "Source size", value: naturalSize ? `${naturalSize.w} × ${naturalSize.h} px` : "—"},
                        ]} />
                      </div>
                    )}

                    {error && <div style={errorBoxStyle}>{error}</div>}

                    <button
                      type="submit"
                      disabled={generating || !name.trim() || !applied || !!dimensionError}
                      className="btn-primary"
                      style={primaryBtnStyle}
                    >
                      {generating ? "Generating…" : "Generate Image Target"}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── Results ── */}
        {phase === "results" && result && (
          <>
            <div style={{marginBottom: 20}}>
              <button onClick={() => setPhase("configure")} style={backBtnStyle}>
                <ChevronLeftIcon /> Back
              </button>
            </div>
            <h1 style={pageTitleStyle}>{result.name}</h1>
            <p style={pageDescStyle}>Generated successfully. Download the zip to use with 8th Wall.</p>

            <div style={{display: "flex", gap: 10, marginBottom: 28, flexWrap: "wrap"}}>
              <button onClick={() => downloadZip(result)} className="btn-primary" style={primaryBtnStyle}>
                Download .zip
              </button>
              <button onClick={handleTestInAR} className="btn-secondary" style={arBtnStyle}>
                <ARIcon /> Test in AR
              </button>
              <button onClick={handleStartOver} className="btn-secondary" style={ghostBtnStyle}>
                New target
              </button>
            </div>

            <div style={{maxWidth: 520, marginBottom: 10}}>
              <button type="button" onClick={() => setShowDetails(v => !v)} style={toggleBtnStyle}>
                <ChevronToggle open={showDetails} /> All details
              </button>
              {showDetails && (
                <div style={{...infoCardStyle, marginTop: 10}}>
                  <InfoRows rows={[
                    {label: "Name",            value: result.name, mono: true},
                    {label: "Type",            value: String(result.descriptor.type ?? "PLANAR")},
                    {label: "Orientation",     value: (result.descriptor.properties as Record<string,unknown>)?.isRotated ? "Landscape" : "Portrait"},
                    {label: "Crop left",       value: String((result.descriptor.properties as Record<string,unknown>)?.left ?? 0)},
                    {label: "Crop top",        value: String((result.descriptor.properties as Record<string,unknown>)?.top ?? 0)},
                    {label: "Crop width",      value: String((result.descriptor.properties as Record<string,unknown>)?.width ?? 0)},
                    {label: "Crop height",     value: String((result.descriptor.properties as Record<string,unknown>)?.height ?? 0)},
                    {label: "Original width",  value: String((result.descriptor.properties as Record<string,unknown>)?.originalWidth ?? 0)},
                    {label: "Original height", value: String((result.descriptor.properties as Record<string,unknown>)?.originalHeight ?? 0)},
                    {label: "Created",         value: new Date(result.descriptor.created as number).toLocaleString()},
                  ]} />
                </div>
              )}
            </div>

            <div style={{maxWidth: 520, marginBottom: 32}}>
              <button type="button" onClick={() => setShowTarget(v => !v)} style={toggleBtnStyle}>
                <ChevronToggle open={showTarget} /> Image target
              </button>
              {showTarget && (
                <div style={{...infoCardStyle, marginTop: 10}}>
                  <div style={{padding: "12px 16px", borderBottom: `1px solid ${c.border}`}}>
                    <div style={{display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8}}>
                      {(["raw","original","cropped","luminance"] as const).map(key => (
                        <div key={key}>
                          <img src={result.urls[key]} alt={key} style={{
                            width: "100%", borderRadius: 6, display: "block",
                            border: `1px solid ${c.border}`,
                          }} />
                          <p style={{margin: "4px 0 0", fontSize: 10, color: c.textMuted, textAlign: "center", textTransform: "capitalize"}}>{key}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <InfoRows rows={flattenDescriptor(result.descriptor)} />
                </div>
              )}
            </div>

            <div style={{maxWidth: 520}}>
              <p style={sectionLabelStyle}>Thumbnail (350 px)</p>
              <img src={result.urls.thumbnail} alt="thumbnail"
                style={{maxWidth: 240, borderRadius: 10, display: "block", border: `1px solid ${c.border}`}} />
            </div>
          </>
        )}
      </div>

      {/* ── AR test overlay ── */}
      {arActivated && result && (
        <ARTestOverlay
          result={result}
          visible={showAR}
          onClose={() => setShowAR(false)}
        />
      )}

      {/* ── Cropper modal ── */}
      {cropperOpen && imgUrl && naturalSize && (
        <CropperModal
          imgUrl={imgUrl}
          naturalSize={naturalSize}
          initialIsRotated={applied ? applied.crop.isRotated : defaultFeasibleRotation(naturalSize.w, naturalSize.h)}
          initialVisualRect={applied?.visualRect ?? null}
          onApply={(r) => { setApplied(r); setCropperOpen(false); }}
          onCancel={() => {
            setCropperOpen(false);
            if (!applied) { setFile(null); setImgUrl(""); setNaturalSize(null); setPhase("upload"); }
          }}
        />
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function flattenDescriptor(d: Record<string, unknown>): {label: string; value: string; mono?: boolean}[] {
  const rows: {label: string; value: string; mono?: boolean}[] = [];
  const add = (label: string, value: unknown, mono = false) => {
    if (value === null || value === undefined) return;
    rows.push({label, value: String(value), mono});
  };
  add("Type", d.type);
  add("Name", d.name, true);
  const props = d.properties as Record<string, unknown> | undefined;
  if (props) {
    add("Left",            props.left);
    add("Top",             props.top);
    add("Width",           props.width);
    add("Height",          props.height);
    add("Is rotated",      String(props.isRotated));
    add("Original width",  props.originalWidth);
    add("Original height", props.originalHeight);
  }
  const res = d.resources as Record<string, unknown> | undefined;
  if (res) {
    const labels: Record<string, string> = {
      rawImage: "Raw image", originalImage: "Original image",
      croppedImage: "Cropped image", thumbnailImage: "Thumbnail image",
      luminanceImage: "Luminance image",
    };
    Object.entries(labels).forEach(([k, label]) => {
      if (typeof res[k] === "string") add(label, res[k], true);
    });
  }
  if (typeof d.created === "number") add("Created", new Date(d.created).toLocaleString());
  if (typeof d.updated === "number") add("Updated", new Date(d.updated).toLocaleString());
  return rows;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function InfoRows({rows}: {rows: {label: string; value: string; mono?: boolean}[]}) {
  return (
    <>
      {rows.map((row, i) => (
        <div key={row.label} style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          gap: 16, padding: "10px 16px",
          borderBottom: i < rows.length - 1 ? `1px solid ${c.border}` : "none",
        }}>
          <span style={{fontSize: 13, color: c.textMuted, flexShrink: 0}}>{row.label}</span>
          <span style={{
            fontSize: row.mono ? 12 : 13,
            color: c.text,
            textAlign: "right",
            fontFamily: row.mono ? "ui-monospace, 'SF Mono', Menlo, monospace" : undefined,
            wordBreak: "break-all",
          }}>{row.value}</span>
        </div>
      ))}
    </>
  );
}

function ChevronToggle({open}: {open: boolean}) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
      style={{marginRight: 6, transition: "transform 0.15s ease", transform: open ? "rotate(90deg)" : "rotate(0deg)", flexShrink: 0}}>
      <path d="M3 1.5L6.5 5L3 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg width="7" height="12" viewBox="0 0 7 12" fill="none" style={{marginRight: 4}}>
      <path d="M6 1L1 6L6 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{marginBottom: 4}}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  );
}

function CropIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: 5, flexShrink: 0}}>
      <path d="M6 2v14a2 2 0 0 0 2 2h14" />
      <path d="M18 22V8a2 2 0 0 0-2-2H2" />
    </svg>
  );
}

function ARIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: 6, flexShrink: 0}}>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const pageTitleStyle: CSSProperties = {
  margin: "0 0 8px", fontSize: 28, fontWeight: 700,
  color: c.text, letterSpacing: "-0.02em",
};

const pageDescStyle: CSSProperties = {
  margin: "0 0 28px", fontSize: 14, color: c.textMuted,
};

const cardStyle: CSSProperties = {
  background: c.surface,
  borderRadius: 16,
  padding: "20px",
  boxShadow: c.shadowMd,
  border: `1px solid ${c.border}`,
};

const infoCardStyle: CSSProperties = {
  background: c.surface,
  borderRadius: 12,
  border: `1px solid ${c.border}`,
  boxShadow: c.shadow,
  overflow: "hidden",
};

const sectionLabelStyle: CSSProperties = {
  margin: "0 0 12px",
  fontSize: 13, fontWeight: 600,
  color: c.textSec,
};

const labelStyle: CSSProperties = {
  display: "block", fontSize: 13, fontWeight: 600,
  color: c.textSec, margin: 0,
};

const primaryBtnStyle: CSSProperties = {
  background: c.accent,
  color: c.accentText,
  border: "none",
  borderRadius: 10,
  padding: "10px 20px",
  fontWeight: 600,
  fontSize: 14,
  cursor: "pointer",
};

const ghostBtnStyle: CSSProperties = {
  background: "none",
  color: c.textMuted,
  border: `1px solid ${c.border}`,
  borderRadius: 10,
  padding: "9px 16px",
  fontWeight: 500,
  fontSize: 13,
  cursor: "pointer",
};

const arBtnStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  background: "none",
  color: c.text,
  border: `1px solid ${c.border}`,
  borderRadius: 10,
  padding: "9px 16px",
  fontWeight: 500,
  fontSize: 13,
  cursor: "pointer",
};

const backBtnStyle: CSSProperties = {
  display: "inline-flex", alignItems: "center",
  background: "none", border: "none",
  color: c.accent, fontSize: 14, fontWeight: 500, cursor: "pointer", padding: 0,
};

const adjustCropBtnStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  background: c.accentLight,
  color: c.accent,
  border: "none",
  borderRadius: 8,
  padding: "6px 14px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
};

const errorBoxStyle: CSSProperties = {
  background: c.dangerBg,
  color: c.dangerText,
  borderRadius: 10,
  padding: "12px 14px",
  fontSize: 13,
  fontWeight: 500,
  marginBottom: 12,
};

const toggleBtnStyle: CSSProperties = {
  display: "inline-flex", alignItems: "center",
  background: "none", border: "none", padding: 0,
  fontSize: 13, fontWeight: 500, color: c.textMuted, cursor: "pointer",
};
