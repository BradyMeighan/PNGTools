import {
  createAiSession,
  type AiBackend,
  type AiSession,
  type ModelLoadProgress,
  type ModelProgressFn,
  type ModelSpec,
  type ProgressFn,
} from '../onnx/session';

// Real-ESRGAN General x4 v3. It is a learned reconstruction model, not a
// browser resize filter. Overlapping tiles keep large images and video frames
// within practical GPU memory limits.
export const REAL_ESRGAN_MODEL: ModelSpec = {
  id: 'realesr-general-x4v3',
  label: 'Real-ESRGAN',
  url: '/models/realesr-general-x4v3.onnx',
  bytes: 4_866_421,
};

const MODEL_SCALE = 4;
const OVERLAP = 16;

let sessionPromise: Promise<AiSession> | null = null;

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('AI processing canceled.', 'AbortError');
}

function toCanvas(src: HTMLImageElement | HTMLCanvasElement): HTMLCanvasElement {
  if (src instanceof HTMLCanvasElement) return src;
  const w = src.naturalWidth || src.width;
  const h = src.naturalHeight || src.height;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(src, 0, 0);
  return canvas;
}

export async function prepareAiUpscaler(
  onProgress?: ModelProgressFn,
  signal?: AbortSignal,
): Promise<AiSession> {
  throwIfAborted(signal);
  if (!sessionPromise) {
    sessionPromise = createAiSession(REAL_ESRGAN_MODEL, onProgress, signal).catch((error) => {
      sessionPromise = null;
      throw error;
    });
  } else {
    onProgress?.({
      phase: 'checking',
      fraction: 0.15,
      label: 'Opening cached Real-ESRGAN model',
      cached: true,
    });
  }

  const prepared = await sessionPromise;
  throwIfAborted(signal);
  onProgress?.({
    phase: 'ready',
    fraction: 1,
    label: prepared.backend === 'webgpu' ? 'Real-ESRGAN ready on GPU' : 'Real-ESRGAN ready on CPU',
    cached: true,
    backend: prepared.backend,
  });
  return prepared;
}

export interface AiUpscaleOptions {
  /** Final delivery scale. The model still reconstructs at 4x internally. */
  targetScale?: 2 | 4;
  signal?: AbortSignal;
  tileSize?: number;
  onModelProgress?: (progress: ModelLoadProgress) => void;
  onBackend?: (backend: AiBackend) => void;
}

export async function aiUpscale(
  src: HTMLImageElement | HTMLCanvasElement,
  onProgress?: ProgressFn,
  options: AiUpscaleOptions = {},
): Promise<HTMLCanvasElement> {
  const targetScale = options.targetScale ?? 4;
  onProgress?.(0.01, 'Preparing Real-ESRGAN…');
  const prepared = await prepareAiUpscaler(options.onModelProgress, options.signal);
  options.onBackend?.(prepared.backend);
  const { session, ort } = prepared;
  throwIfAborted(options.signal);

  const from = toCanvas(src);
  const width = from.width;
  const height = from.height;
  const sourceContext = from.getContext('2d', { willReadFrequently: true })!;

  const output = document.createElement('canvas');
  output.width = width * targetScale;
  output.height = height * targetScale;
  const outputContext = output.getContext('2d')!;
  outputContext.imageSmoothingEnabled = true;
  outputContext.imageSmoothingQuality = 'high';

  const tileSize = Math.max(64, Math.round(options.tileSize ?? (prepared.backend === 'webgpu' ? 192 : 128)));
  const tilesX = Math.ceil(width / tileSize);
  const tilesY = Math.ceil(height / tileSize);
  const totalTiles = tilesX * tilesY;
  let doneTiles = 0;

  const tileCanvas = document.createElement('canvas');
  const tileContext = tileCanvas.getContext('2d')!;

  for (let ty = 0; ty < height; ty += tileSize) {
    for (let tx = 0; tx < width; tx += tileSize) {
      throwIfAborted(options.signal);
      const tileWidth = Math.min(tileSize, width - tx);
      const tileHeight = Math.min(tileSize, height - ty);

      const paddedX0 = Math.max(0, tx - OVERLAP);
      const paddedY0 = Math.max(0, ty - OVERLAP);
      const paddedX1 = Math.min(width, tx + tileWidth + OVERLAP);
      const paddedY1 = Math.min(height, ty + tileHeight + OVERLAP);
      const paddedWidth = paddedX1 - paddedX0;
      const paddedHeight = paddedY1 - paddedY0;

      const pixels = sourceContext.getImageData(paddedX0, paddedY0, paddedWidth, paddedHeight).data;
      const plane = paddedWidth * paddedHeight;
      const input = new Float32Array(3 * plane);
      for (let i = 0; i < plane; i++) {
        input[i] = pixels[i * 4] / 255;
        input[plane + i] = pixels[i * 4 + 1] / 255;
        input[2 * plane + i] = pixels[i * 4 + 2] / 255;
      }

      const tensor = new ort.Tensor('float32', input, [1, 3, paddedHeight, paddedWidth]);
      const result = await session.run({ [session.inputNames[0]]: tensor });
      const resultTensor = result[session.outputNames[0]];
      const data = resultTensor.data as Float32Array;
      const reconstructedWidth = paddedWidth * MODEL_SCALE;
      const reconstructedHeight = paddedHeight * MODEL_SCALE;
      const reconstructedPlane = reconstructedWidth * reconstructedHeight;
      const image = new ImageData(reconstructedWidth, reconstructedHeight);

      for (let i = 0; i < reconstructedPlane; i++) {
        image.data[i * 4] = Math.max(0, Math.min(255, data[i] * 255));
        image.data[i * 4 + 1] = Math.max(0, Math.min(255, data[reconstructedPlane + i] * 255));
        image.data[i * 4 + 2] = Math.max(0, Math.min(255, data[2 * reconstructedPlane + i] * 255));
        image.data[i * 4 + 3] = 255;
      }

      tileCanvas.width = reconstructedWidth;
      tileCanvas.height = reconstructedHeight;
      tileContext.putImageData(image, 0, 0);

      const cropX = (tx - paddedX0) * MODEL_SCALE;
      const cropY = (ty - paddedY0) * MODEL_SCALE;
      outputContext.drawImage(
        tileCanvas,
        cropX,
        cropY,
        tileWidth * MODEL_SCALE,
        tileHeight * MODEL_SCALE,
        tx * targetScale,
        ty * targetScale,
        tileWidth * targetScale,
        tileHeight * targetScale,
      );

      tensor.dispose?.();
      resultTensor.dispose?.();
      doneTiles++;
      onProgress?.(
        0.04 + 0.95 * (doneTiles / totalTiles),
        `Reconstructing detail · tile ${doneTiles}/${totalTiles}`,
      );
      // Give React a chance to paint between compute-heavy tiles.
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    }
  }

  onProgress?.(1, 'AI upscale complete');
  return output;
}

export const AI_MAX_INPUT_PIXELS = 1600 * 1600;
