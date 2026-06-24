import { createSession, getOrt, type ProgressFn } from '../onnx/session';

// AI upscaling with Real-ESRGAN general x4 v3 (small, general-purpose). Runs the
// model in overlapping tiles so any image size works without hitting memory or
// texture limits, then stitches the tiles back with the overlap cropped to hide
// seams. Output is always 4x; callers can resample down to a target afterwards.

const MODEL_URL = '/models/realesr-general-x4v3.onnx';
const SCALE = 4;
const TILE = 128;
const OVERLAP = 16;

let sessionPromise: Promise<any> | null = null; // eslint-disable-line @typescript-eslint/no-explicit-any

function toCanvas(src: HTMLImageElement | HTMLCanvasElement): HTMLCanvasElement {
  if (src instanceof HTMLCanvasElement) return src;
  const w = src.naturalWidth || src.width;
  const h = src.naturalHeight || src.height;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d')!.drawImage(src, 0, 0);
  return c;
}

export async function aiUpscale(
  src: HTMLImageElement | HTMLCanvasElement,
  onProgress?: ProgressFn,
): Promise<HTMLCanvasElement> {
  onProgress?.(0.02, 'Loading AI model…');
  if (!sessionPromise) sessionPromise = createSession(MODEL_URL);
  const session = await sessionPromise;
  const ort = await getOrt();

  const from = toCanvas(src);
  const width = from.width;
  const height = from.height;
  const sctx = from.getContext('2d')!;

  const out = document.createElement('canvas');
  out.width = width * SCALE;
  out.height = height * SCALE;
  const octx = out.getContext('2d')!;

  const tilesX = Math.ceil(width / TILE);
  const tilesY = Math.ceil(height / TILE);
  const totalTiles = tilesX * tilesY;
  let doneTiles = 0;

  for (let ty = 0; ty < height; ty += TILE) {
    for (let tx = 0; tx < width; tx += TILE) {
      const tw = Math.min(TILE, width - tx);
      const th = Math.min(TILE, height - ty);

      // Padded region (clamped to the image) so tile borders have context.
      const px0 = Math.max(0, tx - OVERLAP);
      const py0 = Math.max(0, ty - OVERLAP);
      const px1 = Math.min(width, tx + tw + OVERLAP);
      const py1 = Math.min(height, ty + th + OVERLAP);
      const pw = px1 - px0;
      const ph = py1 - py0;

      const tileData = sctx.getImageData(px0, py0, pw, ph).data;
      const plane = pw * ph;
      const input = new Float32Array(3 * plane);
      for (let i = 0; i < plane; i++) {
        input[i] = tileData[i * 4] / 255;
        input[plane + i] = tileData[i * 4 + 1] / 255;
        input[2 * plane + i] = tileData[i * 4 + 2] / 255;
      }

      const tensor = new ort.Tensor('float32', input, [1, 3, ph, pw]);
      const result = await session.run({ [session.inputNames[0]]: tensor });
      const o = result[session.outputNames[0]];
      const od = o.data as Float32Array;
      const ow = pw * SCALE;
      const oh = ph * SCALE;
      const oplane = ow * oh;

      // Convert the padded output back to RGBA.
      const padded = new ImageData(ow, oh);
      for (let i = 0; i < oplane; i++) {
        padded.data[i * 4] = Math.max(0, Math.min(255, od[i] * 255));
        padded.data[i * 4 + 1] = Math.max(0, Math.min(255, od[oplane + i] * 255));
        padded.data[i * 4 + 2] = Math.max(0, Math.min(255, od[2 * oplane + i] * 255));
        padded.data[i * 4 + 3] = 255;
      }
      // Crop the overlap and place the real tile at its output position.
      const cropX = (tx - px0) * SCALE;
      const cropY = (ty - py0) * SCALE;
      const tmp = document.createElement('canvas');
      tmp.width = ow;
      tmp.height = oh;
      tmp.getContext('2d')!.putImageData(padded, 0, 0);
      octx.drawImage(tmp, cropX, cropY, tw * SCALE, th * SCALE, tx * SCALE, ty * SCALE, tw * SCALE, th * SCALE);

      doneTiles++;
      onProgress?.(0.05 + 0.93 * (doneTiles / totalTiles), `Upscaling tile ${doneTiles}/${totalTiles}…`);
      // Yield so the UI can paint progress.
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  onProgress?.(1, 'Done');
  return out;
}

export const AI_MAX_INPUT_PIXELS = 1600 * 1600; // guard against very long runs
