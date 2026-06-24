import type { RGB, DistanceMetric, RemovalOp, RenderSettings, BrushPoint } from './types';
import { colorDistance, smoothstep01 } from './color';
import { floodRegion } from './flood';
import { gaussianBlurCoverage, despeckleCoverage } from './filters';

// Immutable original pixels plus the mutable coverage ("keep") buffer and the
// per-pixel record of which background color was removed there (so we can
// un-mix it back out during render). Keep is the foreground coverage in [0,1]:
// 1 = fully keep the pixel, 0 = fully transparent.
export interface TransparencyState {
  width: number;
  height: number;
  src: Uint8ClampedArray; // RGBA, never mutated
  keep: Float32Array; // coverage in [0,1]
  bgR: Float32Array; // background color removed at this pixel
  bgG: Float32Array;
  bgB: Float32Array;
}

export function createState(width: number, height: number, src: Uint8ClampedArray): TransparencyState {
  const n = width * height;
  const keep = new Float32Array(n).fill(1);
  return {
    width,
    height,
    src,
    keep,
    bgR: new Float32Array(n),
    bgG: new Float32Array(n),
    bgB: new Float32Array(n),
  };
}

export function resetMask(state: TransparencyState): void {
  state.keep.fill(1);
  state.bgR.fill(0);
  state.bgG.fill(0);
  state.bgB.fill(0);
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

// Fold a coverage value into the mask at pixel i.
//  - removal (add): keep = min(keep, 1 - s), and record the removed color for defringe
//  - restore (subtract): keep = max(keep, s)
function combine(
  state: TransparencyState,
  i: number,
  s: number,
  color: RGB,
  restore: boolean,
): void {
  if (restore) {
    if (s > state.keep[i]) state.keep[i] = s;
    return;
  }
  const nk = 1 - s;
  if (nk < state.keep[i]) {
    state.keep[i] = nk;
    state.bgR[i] = color.r;
    state.bgG[i] = color.g;
    state.bgB[i] = color.b;
  }
}

function stampStroke(
  state: TransparencyState,
  stroke: BrushPoint[],
  radius: number,
  hardness: number,
  restore: boolean,
): void {
  const { width, height, src } = state;
  const core = Math.max(0, Math.min(0.99, hardness));
  const r2 = radius * radius;

  const stampDisk = (cx: number, cy: number) => {
    const minX = Math.max(0, Math.floor(cx - radius));
    const maxX = Math.min(width - 1, Math.ceil(cx + radius));
    const minY = Math.max(0, Math.floor(cy - radius));
    const maxY = Math.min(height - 1, Math.ceil(cy + radius));
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const dd2 = dx * dx + dy * dy;
        if (dd2 > r2) continue;
        const t = Math.sqrt(dd2) / radius;
        const strength = t <= core ? 1 : 1 - smoothstep01((t - core) / (1 - core));
        if (strength <= 0) continue;
        const i = y * width + x;
        const p = i * 4;
        // Erase uses the pixel's own color so defringe is a no-op for manual strokes.
        combine(state, i, strength, { r: src[p], g: src[p + 1], b: src[p + 2] }, restore);
      }
    }
  };

  if (stroke.length === 1) {
    stampDisk(stroke[0].x, stroke[0].y);
    return;
  }
  // Interpolate along each segment so fast strokes do not leave gaps.
  const step = Math.max(1, radius / 3);
  for (let k = 1; k < stroke.length; k++) {
    const a = stroke[k - 1];
    const b = stroke[k];
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(dist / step));
    for (let j = 0; j <= steps; j++) {
      const t = j / steps;
      stampDisk(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
    }
  }
}

// Apply one op onto the current mask state (mutating it).
export function applyOp(state: TransparencyState, op: RemovalOp, metric: DistanceMetric): void {
  if (op.mode === 'new') resetMask(state);
  const restore = op.mode === 'subtract';
  const { width, height, src } = state;
  const n = width * height;

  if (op.kind === 'global' || op.kind === 'flood') {
    const color = op.color ?? { r: 0, g: 0, b: 0 };
    const inner = op.tolerance;
    const outer = Math.min(1, op.tolerance + Math.max(op.softness, 0.001));

    if (op.kind === 'flood' && op.seedX != null && op.seedY != null) {
      const region = new Float32Array(n);
      floodRegion(src, width, height, op.seedX | 0, op.seedY | 0, color, inner, outer, metric, region);
      for (let i = 0; i < n; i++) {
        const s = region[i];
        if (s > 0) combine(state, i, s, color, restore);
      }
    } else {
      const band = Math.max(outer - inner, 1e-6);
      for (let i = 0; i < n; i++) {
        const p = i * 4;
        const d = colorDistance(src[p], src[p + 1], src[p + 2], color.r, color.g, color.b, metric);
        const s = 1 - smoothstep01((d - inner) / band);
        if (s > 0) combine(state, i, s, color, restore);
      }
    }
  } else if (op.kind === 'brush' && op.stroke) {
    stampStroke(state, op.stroke, op.radius ?? 20, op.hardness ?? 0.6, restore);
  } else if (op.kind === 'ai' && op.aiMask) {
    const mask = op.aiMask;
    for (let i = 0; i < n; i++) {
      const s = mask[i] / 255;
      if (s > 0) {
        const p = i * 4;
        combine(state, i, s, { r: src[p], g: src[p + 1], b: src[p + 2] }, restore);
      }
    }
  }
}

// Rebuild the mask from scratch by folding an ordered op list. Used for undo/redo.
export function foldOps(state: TransparencyState, ops: RemovalOp[], metric: DistanceMetric): void {
  resetMask(state);
  for (const op of ops) applyOp(state, op, metric);
}

// Produce the final RGBA pixels: smooth alpha, optional cleanup, defringe, and
// optional solid-color fill. Exports straight (non-premultiplied) alpha, which
// is what canvas and PNG expect.
export function render(state: TransparencyState, settings: RenderSettings): ImageData {
  const { width, height, src, bgR, bgG, bgB } = state;
  const n = width * height;

  let cov = state.keep;
  if (settings.despeckle) cov = despeckleCoverage(cov, width, height);
  if (settings.featherRadius > 0) cov = gaussianBlurCoverage(cov, width, height, settings.featherRadius);

  const out = new ImageData(width, height);
  const o = out.data;
  const replace = settings.replaceColor;

  for (let i = 0; i < n; i++) {
    const p = i * 4;
    const srcA = src[p + 3] / 255;
    const a = srcA * cov[i];
    let r = src[p];
    let g = src[p + 1];
    let b = src[p + 2];

    // Defringe: recover the true foreground by un-mixing the removed background.
    // F = (P - (1 - a) * Bg) / a. Skip near-transparent pixels (divide blows up).
    if (settings.decontaminate && a > 0.04 && a < 0.996) {
      const inv = 1 - a;
      r = clamp255((r - inv * bgR[i]) / a);
      g = clamp255((g - inv * bgG[i]) / a);
      b = clamp255((b - inv * bgB[i]) / a);
    }

    if (replace) {
      const inv = 1 - a;
      o[p] = Math.round(r * a + replace.r * inv);
      o[p + 1] = Math.round(g * a + replace.g * inv);
      o[p + 2] = Math.round(b * a + replace.b * inv);
      o[p + 3] = 255;
    } else {
      o[p] = Math.round(r);
      o[p + 1] = Math.round(g);
      o[p + 2] = Math.round(b);
      o[p + 3] = Math.round(a * 255);
    }
  }
  return out;
}

// Read the RGB at a pixel from the original image (used by the color picker).
export function pixelColorAt(state: TransparencyState, x: number, y: number): RGB {
  const i = (Math.floor(y) * state.width + Math.floor(x)) * 4;
  return { r: state.src[i], g: state.src[i + 1], b: state.src[i + 2] };
}
