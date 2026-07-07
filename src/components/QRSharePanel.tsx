import {useEffect, useRef, useState, type CSSProperties} from "react";
import Peer from "peerjs";
import QRCode from "qrcode";
import {c} from "../theme";
import type {GeneratedTarget} from "../lib/generateTarget";

type Status = "preparing" | "waiting" | "connecting" | "sent" | "error";

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function QRSharePanel({result, onClose}: {
  result: GeneratedTarget;
  onClose: () => void;
}) {
  const [status, setStatus]       = useState<Status>("preparing");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [shareUrl, setShareUrl]   = useState("");
  const [errorMsg, setErrorMsg]   = useState<string | null>(null);
  const peerRef = useRef<InstanceType<typeof Peer> | null>(null);

  // Dismiss on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;

    async function setup() {
      try {
        // Convert luminance blob URL → data URL so it survives the peer transfer
        const resp = await fetch(result.urls.luminance);
        const blob = await resp.blob();
        const luminanceDataUrl = await blobToDataUrl(blob);
        const descriptor: Record<string, unknown> = {...result.descriptor, imagePath: luminanceDataUrl};

        if (cancelled) return;

        const peer = new Peer();
        peerRef.current = peer;

        peer.on("open", async (id) => {
          if (cancelled) return;
          const url = `${window.location.origin}${window.location.pathname}?mode=ar&peer=${id}`;
          setShareUrl(url);
          try {
            const qr = await QRCode.toDataURL(url, {width: 240, margin: 1, color: {dark: "#000000", light: "#ffffff"}});
            if (!cancelled) { setQrDataUrl(qr); setStatus("waiting"); }
          } catch {
            if (!cancelled) { setStatus("error"); setErrorMsg("Failed to generate QR code."); }
          }
        });

        peer.on("connection", (conn) => {
          if (cancelled) return;
          setStatus("connecting");
          conn.on("open", () => {
            if (cancelled) return;
            conn.send({descriptor, name: result.name});
            setStatus("sent");
          });
          conn.on("error", () => {
            if (!cancelled) { setStatus("error"); setErrorMsg("Connection error. Try again."); }
          });
        });

        peer.on("error", (err) => {
          if (!cancelled) { setStatus("error"); setErrorMsg(`Peer error: ${(err as any).type ?? "unknown"}`); }
        });
      } catch {
        if (!cancelled) { setStatus("error"); setErrorMsg("Failed to prepare AR data."); }
      }
    }

    setup();
    return () => {
      cancelled = true;
      peerRef.current?.destroy();
      peerRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const statusText: Record<Status, string> = {
    preparing:  "Preparing…",
    waiting:    "Scan with your phone to test in AR",
    connecting: "Device connecting…",
    sent:       "Sent! Open the camera on your phone.",
    error:      errorMsg ?? "Something went wrong.",
  };

  const isError  = status === "error";
  const isDone   = status === "sent";

  return (
    <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={panelStyle} role="dialog" aria-modal="true" aria-label="Test on Mobile">

        {/* Header */}
        <div style={headerStyle}>
          <span style={titleStyle}>Test on Mobile</span>
          <button onClick={onClose} className="btn-secondary" style={closeBtnStyle} aria-label="Close">✕</button>
        </div>

        {/* Body */}
        <div style={bodyStyle}>
          {/* QR code */}
          <div style={qrWrapStyle}>
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="QR code"
                style={{width: 200, height: 200, display: "block", borderRadius: 8, imageRendering: "pixelated"}}
              />
            ) : (
              <div className="skeleton" style={{width: 200, height: 200, borderRadius: 8}} />
            )}
          </div>

          {/* Status */}
          <p style={{
            ...statusTextStyle,
            color: isError ? c.dangerText : isDone ? c.success : c.textSec,
          }}>
            {statusText[status]}
          </p>

          {/* Step hints */}
          {status === "waiting" && (
            <ol style={stepsStyle}>
              <li>Point your phone camera at the QR code</li>
              <li>Open the link in a browser (not the native camera reader)</li>
              <li>Allow camera access when prompted</li>
              <li>Point your phone at the image target</li>
            </ol>
          )}

          {/* Copy link */}
          {shareUrl && !isDone && (
            <button
              onClick={() => navigator.clipboard?.writeText(shareUrl).catch(() => {})}
              className="btn-secondary"
              style={copyBtnStyle}
            >
              Copy link
            </button>
          )}

          {/* Done state */}
          {isDone && (
            <button onClick={onClose} className="btn-primary" style={doneBtnStyle}>
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.35)",
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
  maxWidth: 380,
  boxShadow: "0 20px 60px rgba(0,0,0,0.2), 0 4px 16px rgba(0,0,0,0.1)",
  border: `1px solid ${c.border}`,
  overflow: "hidden",
};

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "16px 20px 12px",
  borderBottom: `1px solid ${c.border}`,
};

const titleStyle: CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  color: c.text,
  letterSpacing: "-0.01em",
};

const closeBtnStyle: CSSProperties = {
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
  fontSize: 13,
  fontFamily: "inherit",
};

const bodyStyle: CSSProperties = {
  padding: "24px 20px 20px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 16,
};

const qrWrapStyle: CSSProperties = {
  padding: 12,
  background: "#ffffff",
  borderRadius: 12,
  border: `1px solid ${c.border}`,
  lineHeight: 0,
};

const statusTextStyle: CSSProperties = {
  margin: 0,
  fontSize: 14,
  fontWeight: 500,
  textAlign: "center",
};

const stepsStyle: CSSProperties = {
  margin: 0,
  paddingLeft: 20,
  fontSize: 13,
  color: c.textMuted,
  lineHeight: 1.7,
  alignSelf: "stretch",
};

const copyBtnStyle: CSSProperties = {
  background: c.fill,
  border: "none",
  borderRadius: 8,
  padding: "8px 16px",
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
  color: c.textSec,
  fontFamily: "inherit",
};

const doneBtnStyle: CSSProperties = {
  background: c.accent,
  color: c.accentText,
  border: "none",
  borderRadius: 10,
  padding: "10px 24px",
  fontWeight: 600,
  fontSize: 14,
  cursor: "pointer",
};
