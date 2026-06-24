import type { RGB } from './color';
import { colorDistance } from './color';

export interface BackgroundGuess {
  color: RGB;
  tolerance: number; // normalized 0..1
  softness: number; // normalized 0..1
  uniform: boolean; // true when the border is a clean solid-ish color
  coverage: number; // fraction of the border close to the detected color
}

// Look at the border pixels, find the dominant color, and suggest good removal
// settings. This powers both auto-remove-on-upload and the "Auto" button.
export function detectBackground(src: Uint8ClampedArray, width: number, height: number): BackgroundGuess {
  const samples: number[] = []; // pixel indices around the border (a few rows deep)
  const depth = Math.max(1, Math.min(3, Math.floor(Math.min(width, height) * 0.02)));
  for (let d = 0; d < depth; d++) {
    for (let x = 0; x < width; x++) {
      samples.push((d * width + x) * 4);
      samples.push(((height - 1 - d) * width + x) * 4);
    }
    for (let y = 0; y < height; y++) {
      samples.push((y * width + d) * 4);
      samples.push((y * width + (width - 1 - d)) * 4);
    }
  }

  // Histogram in 5-bit-per-channel buckets to find the dominant color cluster.
  const buckets = new Map<number, { count: number; r: number; g: number; b: number }>();
  for (const p of samples) {
    const r = src[p];
    const g = src[p + 1];
    const b = src[p + 2];
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const cur = buckets.get(key);
    if (cur) {
      cur.count++;
      cur.r += r;
      cur.g += g;
      cur.b += b;
    } else {
      buckets.set(key, { count: 1, r, g, b });
    }
  }

  let best = { count: 0, r: 255, g: 255, b: 255 };
  for (const v of buckets.values()) if (v.count > best.count) best = v;
  const color: RGB = {
    r: Math.round(best.r / best.count),
    g: Math.round(best.g / best.count),
    b: Math.round(best.b / best.count),
  };

  // Distances of every border sample to the detected color.
  const dists: number[] = [];
  let near = 0;
  for (const p of samples) {
    const dd = colorDistance(src[p], src[p + 1], src[p + 2], color.r, color.g, color.b, 'weighted');
    dists.push(dd);
    if (dd < 0.1) near++;
  }
  dists.sort((a, b) => a - b);
  const pct = (q: number) => dists[Math.min(dists.length - 1, Math.floor(q * dists.length))] ?? 0;

  const coverage = near / samples.length;
  // Tolerance covers most of the border's natural variation, clamped to sane bounds.
  const tolerance = Math.max(0.04, Math.min(0.2, pct(0.85) + 0.02));

  return {
    color,
    tolerance,
    softness: 0.05,
    uniform: coverage > 0.6,
    coverage,
  };
}
