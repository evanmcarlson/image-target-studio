import type {CropRegion} from "./imageCrop";

const THUMBNAIL_HEIGHT = 350;
const LUMINANCE_HEIGHT = 640;

export interface GeneratedTarget {
  name: string;
  descriptor: Record<string, unknown>;
  blobs: {
    raw:       Blob;
    original:  Blob;
    cropped:   Blob;
    thumbnail: Blob;
    luminance: Blob;
  };
  urls: {
    raw:       string;
    original:  string;
    cropped:   string;
    thumbnail: string;
    luminance: string;
  };
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((res, rej) =>
    canvas.toBlob(b => b ? res(b) : rej(new Error("toBlob failed")), "image/jpeg", 0.92),
  );
}

function drawRotatedCW(img: HTMLImageElement): HTMLCanvasElement {
  const c = makeCanvas(img.naturalHeight, img.naturalWidth);
  const ctx = c.getContext("2d")!;
  ctx.translate(img.naturalHeight, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(img, 0, 0);
  return c;
}

function cropCanvas(src: HTMLCanvasElement, left: number, top: number, w: number, h: number): HTMLCanvasElement {
  const c = makeCanvas(w, h);
  c.getContext("2d")!.drawImage(src, left, top, w, h, 0, 0, w, h);
  return c;
}

function resizeCanvas(src: HTMLCanvasElement, targetH: number): HTMLCanvasElement {
  const scale = targetH / src.height;
  const w = Math.round(src.width * scale);
  const c = makeCanvas(w, targetH);
  c.getContext("2d")!.drawImage(src, 0, 0, w, targetH);
  return c;
}

function grayscale(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = makeCanvas(src.width, src.height);
  const ctx = c.getContext("2d")!;
  ctx.filter = "grayscale(1)";
  ctx.drawImage(src, 0, 0);
  return c;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = url;
  });
}

export async function generateTarget(
  imgUrl: string,
  crop: CropRegion,
  name: string,
): Promise<GeneratedTarget> {
  const img = await loadImage(imgUrl);

  // 1. Raw — original pixels, no transform
  const rawCanvas = makeCanvas(img.naturalWidth, img.naturalHeight);
  rawCanvas.getContext("2d")!.drawImage(img, 0, 0);

  // 2. Original — rotated 90° CW if landscape
  const originalCanvas = crop.isRotated ? drawRotatedCW(img) : rawCanvas;

  // 3. Cropped — extract from working (post-rotation) space
  const croppedCanvas = cropCanvas(originalCanvas, crop.left, crop.top, crop.width, crop.height);

  // 4. Thumbnail — resized cropped
  const thumbnailCanvas = resizeCanvas(croppedCanvas, THUMBNAIL_HEIGHT);

  // 5. Luminance — grayscale at full luminance resolution
  const luminanceCanvas = grayscale(resizeCanvas(croppedCanvas, LUMINANCE_HEIGHT));

  const [rawBlob, originalBlob, croppedBlob, thumbnailBlob, luminanceBlob] = await Promise.all([
    toBlob(rawCanvas),
    toBlob(originalCanvas),
    toBlob(croppedCanvas),
    toBlob(thumbnailCanvas),
    toBlob(luminanceCanvas),
  ]);

  const ext = "jpg";
  const resources = {
    rawImage:       `${name}_raw.${ext}`,
    originalImage:  `${name}_original.${ext}`,
    croppedImage:   `${name}_cropped.${ext}`,
    thumbnailImage: `${name}_thumbnail.${ext}`,
    luminanceImage: `${name}_luminance.${ext}`,
  };

  const workingW = crop.isRotated ? img.naturalHeight : img.naturalWidth;
  const workingH = crop.isRotated ? img.naturalWidth  : img.naturalHeight;

  const descriptor: Record<string, unknown> = {
    type: "PLANAR",
    properties: {
      left: crop.left,
      top:  crop.top,
      width:  crop.width,
      height: crop.height,
      isRotated: crop.isRotated,
      originalWidth:  workingW,
      originalHeight: workingH,
    },
    imagePath: resources.luminanceImage,
    metadata: null,
    name,
    resources,
    created: Date.now(),
    updated: Date.now(),
  };

  const blobs = {raw: rawBlob, original: originalBlob, cropped: croppedBlob, thumbnail: thumbnailBlob, luminance: luminanceBlob};
  const urls  = Object.fromEntries(
    Object.entries(blobs).map(([k, b]) => [k, URL.createObjectURL(b)]),
  ) as GeneratedTarget["urls"];

  return {name, descriptor, blobs, urls};
}

export async function downloadZip(result: GeneratedTarget): Promise<void> {
  const {default: JSZip} = await import("jszip");
  const zip = new JSZip();
  const ext = "jpg";
  const n   = result.name;

  zip.file(`${n}_raw.${ext}`,       result.blobs.raw);
  zip.file(`${n}_original.${ext}`,  result.blobs.original);
  zip.file(`${n}_cropped.${ext}`,   result.blobs.cropped);
  zip.file(`${n}_thumbnail.${ext}`, result.blobs.thumbnail);
  zip.file(`${n}_luminance.${ext}`, result.blobs.luminance);
  zip.file("descriptor.json",       JSON.stringify(result.descriptor, null, 2));

  const blob = await zip.generateAsync({type: "blob"});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `${n}-image-target.zip`;
  a.click();
  URL.revokeObjectURL(url);
}
