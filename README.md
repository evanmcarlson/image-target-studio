# Image Target Studio

A browser-based tool for generating [8th Wall](https://www.8thwall.com/) image target files entirely client-side — no server, no uploads, no API keys.

Drop in a photo, adjust the crop, and download a ready-to-use `.zip` containing all generated image target assets and a `descriptor.json`.

**[Live demo →](https://evanmcarlson.github.io/image-target-studio/)**

---

## What it generates

| File | Description |
|------|-------------|
| `*_raw.jpg` | Original upload, unmodified |
| `*_original.jpg` | Post-rotation working image |
| `*_cropped.jpg` | 3:4 crop region |
| `*_thumbnail.jpg` | Cropped, resized to 350 px tall |
| `*_luminance.jpg` | Cropped, resized to 640 px tall, grayscale |
| `descriptor.json` | Crop metadata in 8th Wall pipeline format |

## Pipeline

The browser Canvas API replicates the server-side `sharp` pipeline:

1. **Rotate** — 90° CW for landscape images (matches 8th Wall's working-space convention)
2. **Crop** — 3:4 region, centered by default; drag to pan
3. **Resize** — proportional scale to target heights
4. **Grayscale** — `ctx.filter = "grayscale(1)"` for the luminance pass

All processing happens in-memory. Nothing leaves the browser.

## Usage

1. Drop or click to upload an image (PNG, JPEG, or WebP)
2. Toggle **Portrait / Landscape** orientation — auto-detected from image dimensions
3. Drag the canvas to pan the crop region
4. Enter a name (used as the filename prefix)
5. Click **Generate Image Target**
6. Review the generated files, then click **Download .zip**

Minimum source image size after crop: **480 × 640 px**.

## Development

```bash
npm install
npm run dev
```

Requires Node 18+.

## Deploy

Pushes to `main` automatically deploy to GitHub Pages via the included Actions workflow. Enable Pages in repo Settings → Pages → Source: **GitHub Actions**.

```bash
git push origin main
```
