import {useEffect, useRef, useState, type CSSProperties} from "react";
import Peer from "peerjs";
import * as THREE from "three";

// XR8's Threejs pipeline module reads THREE off window; it's built for script-tag usage, not ESM imports.
(window as unknown as {THREE: typeof THREE}).THREE = THREE;

export const SESSION_DESCRIPTOR_KEY = "its_ar_descriptor";
export const SESSION_NAME_KEY        = "its_ar_name";

function loadScript(src: string, attrs?: Record<string, string>): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement("script");
    s.src = src;
    s.crossOrigin = "anonymous";
    if (attrs) Object.entries(attrs).forEach(([k, v]) => s.setAttribute(k, v));
    s.onload  = () => resolve();
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

type ImageDetail = {
  position: {x: number; y: number; z: number};
  rotation: {x: number; y: number; z: number; w: number};
  scale: number;
  properties?: {isRotated?: boolean};
};

export function ARTestPage() {
  const params  = new URLSearchParams(window.location.search);
  const peerId  = params.get("peer"); // desktop peer ID — present only on mobile

  // descriptor is set from sessionStorage (same-device) or via peer data (cross-device)
  const [descriptor, setDescriptor] = useState<Record<string, unknown> | null>(() => {
    if (peerId) return null;
    try { return JSON.parse(sessionStorage.getItem(SESSION_DESCRIPTOR_KEY) ?? "null"); }
    catch { return null; }
  });
  const [targetName, setTargetName] = useState(() =>
    peerId ? "target" : (sessionStorage.getItem(SESSION_NAME_KEY) ?? "target"),
  );
  const [peerMsg, setPeerMsg]     = useState<string | null>(peerId ? "Connecting to desktop…" : null);
  const [scriptsLoaded, setScriptsLoaded] = useState(false);
  const [detected, setDetected]   = useState(false);
  const [xrError, setXrError]     = useState<string | null>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const xrStarted   = useRef(false);

  // Lock scroll + pinch-zoom
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    const prevContent  = meta?.getAttribute("content") ?? "";
    const prevOverflow = document.body.style.overflow;
    meta?.setAttribute("content", "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no");
    document.body.style.overflow = "hidden";
    return () => {
      if (meta) meta.setAttribute("content", prevContent);
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  // Load CDN scripts in parallel with peer connection
  useEffect(() => {
    loadScript("https://cdn.jsdelivr.net/npm/@8thwall/xrextras@1/dist/xrextras.js")
      .then(() => loadScript("https://cdn.jsdelivr.net/npm/@8thwall/landing-page@1/dist/landing-page.js"))
      .then(() => loadScript("https://cdn.jsdelivr.net/npm/@8thwall/engine-binary@1/dist/xr.js", {"data-preload-chunks": "slam"}))
      .then(() => setScriptsLoaded(true))
      .catch(() => setXrError("Failed to load AR engine. Check your connection."));
  }, []);

  // Peer receiving — mobile connects to the desktop peer and receives the descriptor
  useEffect(() => {
    if (!peerId) return;
    const peer = new Peer();
    peer.on("open", () => {
      const conn = peer.connect(peerId);
      conn.on("open", () => setPeerMsg("Receiving target data…"));
      conn.on("data", (data) => {
        const {descriptor: d, name} = data as {descriptor: Record<string, unknown>; name: string};
        setDescriptor(d);
        setTargetName(name);
        setPeerMsg(null);
        peer.destroy();
      });
      conn.on("error", () => setXrError("Connection to desktop lost. Rescan the QR code."));
    });
    peer.on("error", () => setXrError("Could not connect to desktop. Rescan the QR code."));
    return () => { peer.destroy(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Start XR8 once both scripts are ready and descriptor is available
  useEffect(() => {
    if (!scriptsLoaded || !descriptor || !canvasRef.current || xrStarted.current) return;
    xrStarted.current = true;

    const canvas = canvasRef.current;

    const init = () => {
      let mesh: THREE.Mesh | null = null;

      const placeMesh = (d: ImageDetail) => {
        if (!mesh) return;
        mesh.position.copy(d.position as unknown as THREE.Vector3);
        mesh.quaternion.copy(d.rotation as unknown as THREE.Quaternion);
        if (d.properties?.isRotated) {
          const rot90 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
          mesh.quaternion.multiply(rot90);
        }
        mesh.scale.set(d.scale, d.scale, d.scale);
        mesh.visible = true;
      };

      const XR8       = (window as any).XR8;
      const XRExtras  = (window as any).XRExtras;
      const LandingPage = (window as any).LandingPage;

      // Disable world tracking
      XR8.XrController.configure({disableWorldTracking: true})

      XR8.addCameraPipelineModules([
        XR8.GlTextureRenderer.pipelineModule(),
        XR8.Threejs.pipelineModule(),
        XR8.XrController.pipelineModule(),
        LandingPage.pipelineModule(),
        XRExtras.FullWindowCanvas.pipelineModule(),
        XRExtras.Loading.pipelineModule(),
        XRExtras.RuntimeError.pipelineModule(),
        {
          name: "its-test-target",

          onStart: ({canvas: c}: {canvas: HTMLCanvasElement}) => {
            const {scene, camera} = XR8.Threejs.xrScene();
            scene.add(new THREE.AmbientLight(0xffffff, 1));

            const props = descriptor.properties as {width: number; height: number};
            const ar = props.width / props.height;
            mesh = new THREE.Mesh(
              new THREE.PlaneGeometry(ar, 1),
              new THREE.MeshBasicMaterial({
                color: 0x30d158,
                transparent: true,
                opacity: 0.35,
                side: THREE.DoubleSide,
                depthWrite: false,
              }),
            );
            mesh.visible = false;
            scene.add(mesh);

            XR8.XrController.configure({imageTargetData: [descriptor]});
            XR8.XrController.updateCameraProjectionMatrix({
              origin: camera.position,
              facing: camera.quaternion,
            });

            c.addEventListener("touchmove", (e: TouchEvent) => e.preventDefault());
          },

          listeners: [
            {
              event: "reality.imagefound",
              process: ({detail}: {detail: ImageDetail}) => { placeMesh(detail); setDetected(true); },
            },
            {
              event: "reality.imageupdated",
              process: ({detail}: {detail: ImageDetail}) => { placeMesh(detail); },
            },
            {
              event: "reality.imagelost",
              process: () => { if (mesh) mesh.visible = false; setDetected(false); },
            },
          ],
        },
      ]);

      XR8.run({canvas, allowedDevices: 'any'});
    };

    if ((window as any).XR8) {
      init();
    } else {
      window.addEventListener("xrloaded", init);
      return () => window.removeEventListener("xrloaded", init);
    }
  }, [scriptsLoaded, descriptor]);

  function close() {
    sessionStorage.removeItem(SESSION_DESCRIPTOR_KEY);
    sessionStorage.removeItem(SESSION_NAME_KEY);
    window.location.href = window.location.pathname;
  }

  return (
    // position: relative keeps this wrapper out of the root stacking context so
    // the canvas (zIndex: 0) and HUD (zIndex: 1) compete at the same root level.
    // A position: fixed wrapper would trap children in its own stacking context,
    // letting XRExtras body-level DOM overlays paint over the HUD.
    <div style={{height: "100%", position: "relative", overflow: "hidden"}}>
      <canvas
        ref={canvasRef}
        style={{position: "fixed", top: 0, left: 0, width: "100%", height: "100%", display: "block", zIndex: 0}}
      />

      <div style={{position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 999, pointerEvents: "none"}}>
        {/* Status chip (top left) */}
        <div style={{position: "absolute", top: 16, left: 16}}>
          {xrError ? (
            <div style={{...chip, background: errorBg, border: `1px solid ${errorBorder}`, color: errorText}}>
              {xrError}
            </div>
          ) : peerMsg ? (
            <div style={chip}>{peerMsg}</div>
          ) : detected ? (
            <div style={{...chip, background: successBg, border: `1px solid ${successBorder}`, color: successText}}>
              ✓ Target detected
            </div>
          ) : (
            <div style={chip}>Scanning for "{targetName}"</div>
          )}
        </div>

        {/* Close button (top right) */}
        <button onClick={close} style={{...chip, ...closeBtnStyle}}>
          ✕ Close
        </button>
      </div>
    </div>
  );
}

// Always-dark colours — camera context, independent of app theme
const successBg     = "rgba(48, 209, 88, 0.18)";
const successBorder = "#30D158";
const successText   = "#30D158";
const errorBg       = "rgba(255, 69, 58, 0.18)";
const errorBorder   = "#FF453A";
const errorText     = "#FF453A";

const chip: CSSProperties = {
  background: "rgba(28, 28, 30, 0.72)",
  backdropFilter: "saturate(180%) blur(20px)",
  WebkitBackdropFilter: "saturate(180%) blur(20px)",
  border: "1px solid rgba(84, 84, 88, 0.45)",
  borderRadius: 12,
  padding: "10px 16px",
  color: "#ffffff",
  fontSize: 13,
  fontWeight: 500,
  boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
  pointerEvents: "auto",
};

const closeBtnStyle: CSSProperties = {
  position: "absolute",
  top: 16,
  right: 16,
  cursor: "pointer",
  fontFamily: "inherit",
  background: "rgba(28, 28, 30, 0.72)",
  border: "1px solid rgba(84, 84, 88, 0.45)",
};
