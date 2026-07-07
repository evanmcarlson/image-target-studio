import {useEffect, useRef, useState, type CSSProperties} from "react";
import * as THREE from "three";
import type {GeneratedTarget} from "../lib/generateTarget";

(window as unknown as {THREE: typeof THREE}).THREE = THREE;

// XR8.run() can only fire once per page load.
let xr8Started = false;

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

export {xr8Started};

export function ARTestOverlay({result, onClose, visible}: {result: GeneratedTarget; onClose: () => void; visible: boolean}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [detected, setDetected] = useState(false);
  const [xrError, setXrError]   = useState<string | null>(null);

  // Lock viewport while AR is visible; restore when hidden
  useEffect(() => {
    if (!visible) return;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    const prevContent  = meta?.getAttribute("content") ?? "";
    const prevOverflow = document.body.style.overflow;
    meta?.setAttribute("content", "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no");
    document.body.style.overflow = "hidden";
    return () => {
      if (meta) meta.setAttribute("content", prevContent);
      document.body.style.overflow = prevOverflow;
    };
  }, [visible]);

  useEffect(() => {
    if ((window as any).XR8) return;
    loadScript("https://cdn.jsdelivr.net/npm/@8thwall/xrextras@1/dist/xrextras.js")
      .then(() => loadScript("https://cdn.jsdelivr.net/npm/@8thwall/landing-page@1/dist/landing-page.js"))
      .then(() => loadScript("https://cdn.jsdelivr.net/npm/@8thwall/engine-binary@1/dist/xr.js", {"data-preload-chunks": "slam"}))
      .catch(() => setXrError("Failed to load AR engine. Check your connection."));
  }, []);

  useEffect(() => {
    if (!canvasRef.current || xr8Started) return;
    xr8Started = true;

    const canvas = canvasRef.current;
    const descriptor: Record<string, unknown> = {...result.descriptor, imagePath: result.urls.luminance};

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

      const XR8        = (window as any).XR8;
      const XRExtras   = (window as any).XRExtras;
      const LandingPage = (window as any).LandingPage;

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
              new THREE.MeshBasicMaterial({color: 0x30d158, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false}),
            );
            mesh.visible = false;
            scene.add(mesh);
            XR8.XrController.configure({imageTargetData: [descriptor]});
            XR8.XrController.updateCameraProjectionMatrix({origin: camera.position, facing: camera.quaternion});
            c.addEventListener("touchmove", (e: TouchEvent) => e.preventDefault());
          },
          listeners: [
            {event: "reality.imagefound",  process: ({detail}: {detail: ImageDetail}) => { placeMesh(detail); setDetected(true); }},
            {event: "reality.imageupdated", process: ({detail}: {detail: ImageDetail}) => { placeMesh(detail); }},
            {event: "reality.imagelost",   process: () => { if (mesh) mesh.visible = false; setDetected(false); }},
          ],
        },
      ]);

      XR8.run({canvas});
    };

    if ((window as any).XR8) { init(); } else { window.addEventListener("xrloaded", init); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Canvas is the base — always in the DOM once mounted, always position:fixed at z:0.
  // The app UI sits on top of it with a solid background. Showing/hiding AR means
  // showing/hiding the app UI, not the canvas. The HUD is only rendered when visible.
  return (
    <>
      <canvas ref={canvasRef}
        style={{position: "fixed", inset: 0, width: "100%", height: "100%", display: "block", zIndex: 0}} />
      {visible && (
        <div style={{position: "fixed", inset: 0, zIndex: 1, pointerEvents: "none"}}>
          <div style={{position: "absolute", top: 16, left: 16}}>
            {xrError ? (
              <div style={{...chip, background: errorBg, border: `1px solid ${errorBorder}`, color: errorText}}>{xrError}</div>
            ) : detected ? (
              <div style={{...chip, background: successBg, border: `1px solid ${successBorder}`, color: successText}}>✓ Target detected</div>
            ) : (
              <div style={chip}>Scanning for "{result.name}"</div>
            )}
          </div>
          <button onClick={onClose} style={{...chip, ...closeBtnStyle}}>✕ Close</button>
        </div>
      )}
    </>
  );
}

const successBg = "rgba(48, 209, 88, 0.18)"; const successBorder = "#30D158"; const successText = "#30D158";
const errorBg   = "rgba(255, 69, 58, 0.18)";  const errorBorder   = "#FF453A"; const errorText   = "#FF453A";

const chip: CSSProperties = {
  background: "rgba(28, 28, 30, 0.72)",
  backdropFilter: "saturate(180%) blur(20px)", WebkitBackdropFilter: "saturate(180%) blur(20px)",
  border: "1px solid rgba(84, 84, 88, 0.45)", borderRadius: 12,
  padding: "10px 16px", color: "#ffffff", fontSize: 13, fontWeight: 500,
  boxShadow: "0 2px 8px rgba(0,0,0,0.5)", pointerEvents: "auto",
};

const closeBtnStyle: CSSProperties = {
  position: "absolute", top: 16, right: 16,
  cursor: "pointer", fontFamily: "inherit",
  background: "rgba(28, 28, 30, 0.72)", border: "1px solid rgba(84, 84, 88, 0.45)",
};
