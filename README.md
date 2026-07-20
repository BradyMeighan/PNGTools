# Quick Asset Tools

A fast, private, browser-based image and video toolkit for everyday website
asset work. Everything runs locally in the browser: files are never uploaded to
a server.

## Tools

- **Transparency** — Remove backgrounds. Auto-detects and removes the background
  on upload, then lets you refine with click-to-erase, a restore tool, and a
  brush. Smooth anti-aliased edges with color-fringe removal (defringe), zoom and
  pan, full undo/redo, and an optional one-click AI cutout for photos.
- **Crop** — Manually crop, snap to website/social aspect ratios, or automatically
  trim empty edges.
- **Compression** — Bulk-compress many images at once with a quality slider and
  optional max-dimension downscaling. Shows per-file savings and a zip download.
- **Converter** — Bulk-convert images to WebP, PNG, or JPEG. Handles iPhone HEIC.
- **Enhancer** — Upscale and sharpen. "High quality" uses Lanczos resampling
  (instant, reliable); "AI" uses Real-ESRGAN x4 (tiled, best for small images).
- **Favicon** — Generate a full favicon set plus `site.webmanifest` from one image.
- **Favicon downloader** — Inspect a public website for declared, manifest,
  Apple touch, and conventional favicon assets, then download individual files
  or a complete zip.
- **Meta checker** — Audit title, description, canonical, robots, viewport, Open
  Graph, and X/Twitter tags with search and social-card previews.
- **Video editor** — Trim the ends or remove multiple sections from the middle
  of MP4, MOV, WebM, or MKV videos. Export locally as MP4 or WebM with source,
  4K, 1440p, 1080p, 720p, or 480p sizing. Simple end trims remain lossless;
  joins, format changes, and downscaling use browser-native hardware acceleration
  when available. Large files can stream directly to disk in supported browsers.
- **AI video / FPS Boost** — Use RIFE to create real in-between frames at 2x or
  4x FPS, with scene-cut protection and full or balanced motion analysis.
- **AI video / AI Upscale** — Use AMD SESR for native learned 2x
  super-resolution, including 1080p-to-4K delivery.

## How it works

- Built with React 19, Vite, TypeScript, and Tailwind CSS.
- The transparency engine (`src/lib/transparency`) keeps the original pixels
  immutable and folds a list of reversible operations into a coverage mask, which
  is what powers staged, non-destructive editing and undo/redo.
- AI features use `onnxruntime-web` with self-hosted, permissively-licensed models
  (U2Net-p for cutout, Real-ESRGAN general x4 v3 for upscaling) under
  `public/models`. The runtime and models are lazy-loaded only on first AI use.
- AI video reports model download, engine initialization, processing, encoding,
  and saving as separate stages. WebGPU is preferred in current Chrome/Edge,
  with a slower WASM fallback. Models may download; user media never uploads.
- Tools are code-split, so the initial page load stays small.

See [`docs/AI_MODELS.md`](docs/AI_MODELS.md) for model provenance, hashes, and licenses.

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
