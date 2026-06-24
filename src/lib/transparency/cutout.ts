import { createSession, getOrt, type ProgressFn } from '../onnx/session';

// One-click AI subject cutout using U2Net-p (small, Apache-2.0, commercial-safe).
// Returns a per-pixel BACKGROUND removal strength (0..255, where 255 means
// "this is background, remove it"), ready to seed the transparency mask.

const MODEL_URL = '/models/u2netp.onnx';
const SIZE = 320; // u2net works at 320x320
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

let sessionPromise: Promise<any> | null = null; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function aiCutout(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  onProgress?: ProgressFn,
): Promise<Uint8Array> {
  onProgress?.(0.05, 'Loading AI model…');
  if (!sessionPromise) sessionPromise = createSession(MODEL_URL);
  const session = await sessionPromise;
  const ort = await getOrt();

  // Resize the source down to the model input via canvas.
  const full = document.createElement('canvas');
  full.width = width;
  full.height = height;
  full.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(src), width, height), 0, 0);

  const small = document.createElement('canvas');
  small.width = SIZE;
  small.height = SIZE;
  const sctx = small.getContext('2d')!;
  sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(full, 0, 0, SIZE, SIZE);
  const px = sctx.getImageData(0, 0, SIZE, SIZE).data;

  // Build the normalized NCHW input tensor.
  const input = new Float32Array(3 * SIZE * SIZE);
  const plane = SIZE * SIZE;
  for (let i = 0; i < plane; i++) {
    input[i] = (px[i * 4] / 255 - MEAN[0]) / STD[0];
    input[plane + i] = (px[i * 4 + 1] / 255 - MEAN[1]) / STD[1];
    input[2 * plane + i] = (px[i * 4 + 2] / 255 - MEAN[2]) / STD[2];
  }

  onProgress?.(0.4, 'Finding the subject…');
  const tensor = new ort.Tensor('float32', input, [1, 3, SIZE, SIZE]);
  const feeds: Record<string, unknown> = { [session.inputNames[0]]: tensor };
  const out = await session.run(feeds);
  const map = out[session.outputNames[0]].data as Float32Array;

  // Min-max normalize the saliency map to 0..1.
  let mi = Infinity;
  let ma = -Infinity;
  for (let i = 0; i < plane; i++) {
    if (map[i] < mi) mi = map[i];
    if (map[i] > ma) ma = map[i];
  }
  const range = ma - mi || 1;

  // Paint the foreground map and scale it back up to full resolution (smoothly).
  const maskSmall = document.createElement('canvas');
  maskSmall.width = SIZE;
  maskSmall.height = SIZE;
  const mctx = maskSmall.getContext('2d')!;
  const mImg = mctx.createImageData(SIZE, SIZE);
  for (let i = 0; i < plane; i++) {
    const fg = Math.round(((map[i] - mi) / range) * 255);
    mImg.data[i * 4] = fg;
    mImg.data[i * 4 + 1] = fg;
    mImg.data[i * 4 + 2] = fg;
    mImg.data[i * 4 + 3] = 255;
  }
  mctx.putImageData(mImg, 0, 0);

  onProgress?.(0.85, 'Refining edges…');
  const fullMask = document.createElement('canvas');
  fullMask.width = width;
  fullMask.height = height;
  const fctx = fullMask.getContext('2d')!;
  fctx.imageSmoothingEnabled = true;
  fctx.imageSmoothingQuality = 'high';
  fctx.drawImage(maskSmall, 0, 0, width, height);
  const fg = fctx.getImageData(0, 0, width, height).data;

  const removal = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) removal[i] = 255 - fg[i * 4];
  onProgress?.(1, 'Done');
  return removal;
}
