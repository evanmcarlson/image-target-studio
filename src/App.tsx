import {useEffect, useRef, useState, type CSSProperties, type FormEvent} from "react";
import {c} from "./theme";
import {computeCrop, autoDetectRotation, type CropRegion} from "./lib/imageCrop";
import {generateTarget, downloadZip, type GeneratedTarget} from "./lib/generateTarget";
import {CropPreview, OrientationToggle} from "./components/CropPreview";

type Phase = "upload" | "configure" | "results";

export function App() {
  const [phase, setPhase]             = useState<Phase>("upload");
  const [file, setFile]               = useState<File | null>(null);
  const [imgUrl, setImgUrl]           = useState("");
  const [naturalSize, setNaturalSize] = useState<{w: number; h: number} | null>(null);
  const [isRotated, setIsRotated]     = useState(false);
  const [cropOffset, setCropOffset]   = useState({x: 0, y: 0});
  const [name, setName]               = useState("");
  const [generating, setGenerating]   = useState(false);
  const [result, setResult]           = useState<GeneratedTarget | null>(null);
  const [error, setError]             = useState<string | null>(null);
  const [draggingOver, setDraggingOver] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showTarget, setShowTarget]   = useState(false);
  const fileInputRef                  = useRef<HTMLInputElement>(null);

  const workingW = isRotated ? (naturalSize?.h ?? 0) : (naturalSize?.w ?? 0);
  const workingH = isRotated ? (naturalSize?.w ?? 0) : (naturalSize?.h ?? 0);
  const workingSize = naturalSize ? {w: workingW, h: workingH} : null;
  const crop: CropRegion | null = workingSize
    ? computeCrop(workingW, workingH, isRotated, cropOffset)
    : null;
  const autoRotated = naturalSize ? autoDetectRotation(naturalSize.w, naturalSize.h) : false;
  const tooSmall = crop ? (crop.width < 480 || crop.height < 640) : false;

  useEffect(() => { setCropOffset({x: 0, y: 0}); }, [isRotated]);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setImgUrl(url);
    const img = new Image();
    img.onload = () => {
      setNaturalSize({w: img.naturalWidth, h: img.naturalHeight});
      setIsRotated(autoDetectRotation(img.naturalWidth, img.naturalHeight));
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
    if (!crop || !imgUrl || !name.trim() || tooSmall) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await generateTarget(imgUrl, crop, name.trim());
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

  function handleStartOver() {
    setFile(null);
    setImgUrl("");
    setNaturalSize(null);
    setIsRotated(false);
    setCropOffset({x: 0, y: 0});
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
            <p style={pageDescStyle}>Drag to pan the crop region. Toggle orientation if needed.</p>

            <div style={{display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap"}}>
              {/* Crop preview card */}
              <div style={{flex: "1 1 260px", maxWidth: 400}}>
                <div style={cardStyle}>
                  <p style={sectionLabelStyle}>Image Target</p>
                  {tooSmall && <div style={errorBoxStyle}>Image too small — minimum 480 × 640 px after crop.</div>}
                  <CropPreview
                    imgUrl={imgUrl}
                    crop={crop}
                    naturalSize={workingSize}
                    cropOffset={cropOffset}
                    onOffsetChange={setCropOffset}
                  />
                  <div style={{marginTop: 10, display: "flex", alignItems: "center", gap: 8}}>
                    <OrientationToggle isRotated={isRotated} autoRotated={autoRotated} onChange={setIsRotated} />
                    <input ref={fileInputRef} type="file" accept="image/*" style={{display: "none"}}
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
                    <label onClick={() => fileInputRef.current?.click()}
                      style={{marginLeft: "auto", fontSize: 12, color: c.accent, cursor: "pointer", fontWeight: 500}}>
                      Change image
                    </label>
                  </div>
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

                    {crop && (
                      <div style={{...infoCardStyle, borderRadius: 10}}>
                        <InfoRows rows={[
                          {label: "Orientation", value: isRotated ? "Landscape" : "Portrait"},
                          {label: "Crop size",   value: `${crop.width} × ${crop.height} px`},
                          {label: "Offset",      value: `${crop.left}, ${crop.top}`},
                          {label: "Source size", value: naturalSize ? `${naturalSize.w} × ${naturalSize.h} px` : "—"},
                        ]} />
                      </div>
                    )}

                    {error && <div style={errorBoxStyle}>{error}</div>}

                    <button type="submit" disabled={generating || !name.trim() || tooSmall}
                      className="btn-primary" style={primaryBtnStyle}>
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

            <div style={{display: "flex", gap: 10, marginBottom: 28}}>
              <button onClick={() => downloadZip(result)} className="btn-primary" style={primaryBtnStyle}>
                Download .zip
              </button>
              <button onClick={handleStartOver} className="btn-secondary" style={ghostBtnStyle}>
                New target
              </button>
            </div>

            {/* All details */}
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

            {/* Image target drop-down */}
            <div style={{maxWidth: 520, marginBottom: 32}}>
              <button type="button" onClick={() => setShowTarget(v => !v)} style={toggleBtnStyle}>
                <ChevronToggle open={showTarget} /> Image target
              </button>
              {showTarget && (
                <div style={{...infoCardStyle, marginTop: 10}}>
                  {/* Image grid */}
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
                  {/* Property rows */}
                  <InfoRows rows={flattenDescriptor(result.descriptor)} />
                </div>
              )}
            </div>

            {/* Thumbnail */}
            <div style={{maxWidth: 520}}>
              <p style={sectionLabelStyle}>Thumbnail (350 px)</p>
              <img src={result.urls.thumbnail} alt="thumbnail"
                style={{maxWidth: 240, borderRadius: 10, display: "block", border: `1px solid ${c.border}`}} />
            </div>
          </>
        )}
      </div>
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

const backBtnStyle: CSSProperties = {
  display: "inline-flex", alignItems: "center",
  background: "none", border: "none",
  color: c.accent, fontSize: 14, fontWeight: 500, cursor: "pointer", padding: 0,
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
