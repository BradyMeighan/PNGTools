import type { RGB, DistanceMetric } from './color';
import { colorDistance, smoothstep01 } from './color';

// Seeded flood fill from a clicked point. Returns membership in [0,1] per pixel
// where the value is the soft ramp (so anti-aliased edges are included), and 0
// means the pixel is outside the connected matching region.
//
// This is what makes "click the white trapped inside an O" work: the fill only
// grows through contiguous matching pixels from the seed, so an enclosed pocket
// is selected on its own without touching matching pixels elsewhere.
export function floodRegion(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  seedX: number,
  seedY: number,
  target: RGB,
  inner: number,
  outer: number,
  metric: DistanceMetric,
  out: Float32Array,
): void {
  out.fill(0);
  if (seedX < 0 || seedY < 0 || seedX >= width || seedY >= height) return;

  floodFrom(src, width, height, [seedY * width + seedX], target, inner, outer, metric, out);
}

// Flood inward from every border pixel at once. This is the "remove the background
// that touches the edges" behaviour, used by auto-remove. It leaves enclosed
// pockets (like the inside of an O) alone, which is usually what people want.
export function floodFromEdges(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  target: RGB,
  inner: number,
  outer: number,
  metric: DistanceMetric,
  out: Float32Array,
): void {
  out.fill(0);
  const seeds: number[] = [];
  for (let x = 0; x < width; x++) {
    seeds.push(x);
    seeds.push((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y++) {
    seeds.push(y * width);
    seeds.push(y * width + width - 1);
  }
  floodFrom(src, width, height, seeds, target, inner, outer, metric, out);
}

function floodFrom(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  seeds: number[],
  target: RGB,
  inner: number,
  outer: number,
  metric: DistanceMetric,
  out: Float32Array,
): void {
  const n = width * height;
  const visited = new Uint8Array(n);
  const stack: number[] = seeds.filter((i) => i >= 0 && i < n);
  const band = Math.max(outer - inner, 1e-6);

  while (stack.length) {
    const idx = stack.pop()!;
    if (visited[idx]) continue;
    visited[idx] = 1;

    const p = idx * 4;
    const d = colorDistance(
      src[p], src[p + 1], src[p + 2],
      target.r, target.g, target.b,
      metric,
    );
    // Do not expand through pixels that are not part of the matching region.
    if (d > outer) continue;

    out[idx] = 1 - smoothstep01((d - inner) / band);

    const x = idx % width;
    const y = (idx - x) / width;
    if (x > 0 && !visited[idx - 1]) stack.push(idx - 1);
    if (x < width - 1 && !visited[idx + 1]) stack.push(idx + 1);
    if (y > 0 && !visited[idx - width]) stack.push(idx - width);
    if (y < height - 1 && !visited[idx + width]) stack.push(idx + width);
  }
}
