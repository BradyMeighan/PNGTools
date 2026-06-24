# PNG Tools

A fast, private, browser-based image toolkit. Everything runs locally in the
browser: images are never uploaded to a server.

## Tools

- **Transparency** — Remove backgrounds. Auto-detects and removes the background
  on upload, then lets you refine with click-to-erase, a restore tool, and a
  brush. Smooth anti-aliased edges with color-fringe removal (defringe), zoom and
  pan, full undo/redo, and an optional one-click AI cutout for photos.
- **Compression** — Bulk-compress many images at once with a quality slider and
  optional max-dimension downscaling. Shows per-file savings and a zip download.
- **Converter** — Bulk-convert images to WebP, PNG, or JPEG. Handles iPhone HEIC.
- **Enhancer** — Upscale and sharpen. "High quality" uses Lanczos resampling
  (instant, reliable); "AI" uses Real-ESRGAN x4 (tiled, best for small images).
- **Favicon** — Generate a full favicon set plus `site.webmanifest` from one image.

## How it works

- Built with React 19, Vite, TypeScript, and Tailwind CSS.
- The transparency engine (`src/lib/transparency`) keeps the original pixels
  immutable and folds a list of reversible operations into a coverage mask, which
  is what powers staged, non-destructive editing and undo/redo.
- AI features use `onnxruntime-web` with self-hosted, permissively-licensed models
  (U2Net-p for cutout, Real-ESRGAN general x4 v3 for upscaling) under
  `public/models`. The runtime and models are lazy-loaded only on first AI use.
- Tools are code-split, so the initial page load stays small.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build to dist/
```

### Notes on the AI runtime

The ONNX Runtime wasm assets live in `public/ort` (copied from
`node_modules/onnxruntime-web/dist`). In production they are served from there; in
the Vite dev server they load from a version-matched CDN to avoid a dev-only
module-rewriting issue. If you upgrade `onnxruntime-web`, refresh `public/ort` and
the version pin in `src/lib/onnx/session.ts`.
