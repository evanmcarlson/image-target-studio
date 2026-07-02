export type CropRegion = {
  left: number;
  top: number;
  width: number;
  height: number;
  isRotated: boolean;
};

export function computeCrop(
  workingW: number,
  workingH: number,
  isRotated: boolean,
  offset?: {x: number; y: number},
): CropRegion {
  let left: number, top: number, width: number, height: number;

  if (workingW / 3 > workingH / 4) {
    width  = Math.round((workingH * 3) / 4);
    height = workingH;
    left   = Math.round((workingW - width) / 2);
    top    = 0;
  } else {
    width  = workingW;
    height = Math.round((workingW * 4) / 3);
    left   = 0;
    top    = Math.round((workingH - height) / 2);
  }

  if (offset) {
    left = Math.max(0, Math.min(workingW - width,  Math.round(left + offset.x)));
    top  = Math.max(0, Math.min(workingH - height, Math.round(top  + offset.y)));
  }

  return {left, top, width, height, isRotated};
}

export function autoDetectRotation(naturalW: number, naturalH: number): boolean {
  return naturalW >= naturalH;
}
