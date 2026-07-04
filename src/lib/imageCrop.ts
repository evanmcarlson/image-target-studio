// Two coordinate spaces:
//   Visual space:  the image as the browser shows it (upright). The cropper
//                  UI and react-easy-crop's croppedAreaPixels live here.
//   Working space: what the pipeline crops in. Landscape targets are rotated
//                  90° CW by the canvas pipeline before extract, so working =
//                  visual rotated CW. Portrait targets: working == visual.

export type CropRegion = {
  left: number;
  top: number;
  width: number;
  height: number;
  isRotated: boolean;
};

// react-easy-crop's croppedAreaPixels shape, in visual space.
export type VisualRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export const MIN_CROP_WIDTH = 480;
export const MIN_CROP_HEIGHT = 640;

export function autoDetectRotation(naturalW: number, naturalH: number): boolean {
  return naturalW >= naturalH;
}

export function minVisualSize(isRotated: boolean): {width: number; height: number} {
  return isRotated
    ? {width: MIN_CROP_HEIGHT, height: MIN_CROP_WIDTH}
    : {width: MIN_CROP_WIDTH, height: MIN_CROP_HEIGHT};
}

export function orientationFeasible(naturalW: number, naturalH: number, isRotated: boolean): boolean {
  const min = minVisualSize(isRotated);
  return naturalW >= min.width && naturalH >= min.height;
}

export function defaultFeasibleRotation(naturalW: number, naturalH: number): boolean {
  const auto = autoDetectRotation(naturalW, naturalH);
  if (orientationFeasible(naturalW, naturalH, auto)) return auto;
  return orientationFeasible(naturalW, naturalH, !auto) ? !auto : auto;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function normalizeVisualRect(
  rect: VisualRect,
  naturalW: number,
  naturalH: number,
  isRotated: boolean,
): VisualRect {
  const min = minVisualSize(isRotated);
  const width = clamp(Math.round(rect.width), Math.min(min.width, naturalW), naturalW);
  const height = clamp(Math.round(rect.height), Math.min(min.height, naturalH), naturalH);
  return {
    width,
    height,
    x: clamp(Math.round(rect.x), 0, naturalW - width),
    y: clamp(Math.round(rect.y), 0, naturalH - height),
  };
}

// Visual → working. Under a 90° CW rotation of a W×H image, rect
// (x, y, w, h) maps to (H − y − h, x, h, w).
export function visualToWorking(
  rect: VisualRect,
  naturalW: number,
  naturalH: number,
  isRotated: boolean,
): CropRegion {
  const r = normalizeVisualRect(rect, naturalW, naturalH, isRotated);
  if (!isRotated) {
    return {left: r.x, top: r.y, width: r.width, height: r.height, isRotated: false};
  }
  return {
    left: naturalH - r.y - r.height,
    top: r.x,
    width: r.height,
    height: r.width,
    isRotated: true,
  };
}

export function workingToVisual(crop: CropRegion, naturalH: number): VisualRect {
  if (!crop.isRotated) {
    return {x: crop.left, y: crop.top, width: crop.width, height: crop.height};
  }
  return {
    x: crop.top,
    y: naturalH - crop.left - crop.width,
    width: crop.height,
    height: crop.width,
  };
}

export function renderCropPreview(imgUrl: string, rect: VisualRect): Promise<string> {
  const MAX_EDGE = 1000;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_EDGE / Math.max(rect.width, rect.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(rect.width * scale));
      canvas.height = Math.max(1, Math.round(rect.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas unavailable")); return; }
      ctx.drawImage(img, rect.x, rect.y, rect.width, rect.height, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.88));
    };
    img.onerror = () => reject(new Error("Failed to load image for preview"));
    img.src = imgUrl;
  });
}
