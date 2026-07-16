import {
  createAiSession,
  getOrt,
  type AiBackend,
  type AiSession,
  type ModelProgressFn,
  type ModelSpec,
  type ProgressFn,
} from '../onnx/session';

// AMD's native x2 SESR export. Unlike an ordinary resize, this learned network
// reconstructs a higher-resolution frame. Its fixed 256px input makes memory
// predictable and all graph operators are supported by ORT WebGPU.
export const SESR_MODEL: ModelSpec = {
  id: 'amd-sesr-x2',
  label: 'AMD SESR x2',
  url: '/models/amd-sesr-x2.onnx',
  bytes: 93_732,
};

const INPUT_TILE = 256;
const HALO = 12;
const CORE = INPUT_TILE - HALO * 2;
const SCALE = 2;
const OUTPUT_TILE = INPUT_TILE * SCALE;
const OUTPUT_HALO = HALO * SCALE;

let sessionPromise: Promise<AiSession> | null = null;

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('AI processing canceled.', 'AbortError');
}

export async function prepareVideoSuperResolution(
  onProgress?: ModelProgressFn,
  signal?: AbortSignal,
) {
  throwIfAborted(signal);
  if (!sessionPromise) {
    sessionPromise = createAiSession(SESR_MODEL, onProgress, signal).catch((error) => {
      sessionPromise = null;
      throw error;
    });
  } else {
    onProgress?.({ phase: 'checking', fraction: 0.2, label: 'Opening cached AMD SESR model', cached: true });
  }
  const prepared = await sessionPromise;
  throwIfAborted(signal);
  onProgress?.({
    phase: 'ready',
    fraction: 1,
    label: prepared.backend === 'webgpu' ? 'SESR ready on GPU' : 'SESR ready on CPU',
    cached: true,
    backend: prepared.backend,
  });
  return prepared;
}

function reflectIndex(index: number, size: number) {
  if (size <= 1) return 0;
  const period = size * 2 - 2;
  const normalized = ((index % period) + period) % period;
  return normalized < size ? normalized : period - normalized;
}

export interface VideoSuperResolutionOptions {
  signal?: AbortSignal;
  onBackend?: (backend: AiBackend) => void;
}

export async function upscaleVideoFrame2x(
  source: HTMLCanvasElement,
  onProgress?: ProgressFn,
  options: VideoSuperResolutionOptions = {},
) {
  const prepared = await prepareVideoSuperResolution(undefined, options.signal);
  options.onBackend?.(prepared.backend);
  const ort = await getOrt();
  const width = source.width;
  const height = source.height;
  const sourcePixels = source.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, width, height).data;

  const output = document.createElement('canvas');
  output.width = width * SCALE;
  output.height = height * SCALE;
  const outputContext = output.getContext('2d')!;

  const tileCanvas = document.createElement('canvas');
  tileCanvas.width = OUTPUT_TILE;
  tileCanvas.height = OUTPUT_TILE;
  const tileContext = tileCanvas.getContext('2d')!;

  const tilesX = Math.ceil(width / CORE);
  const tilesY = Math.ceil(height / CORE);
  const totalTiles = tilesX * tilesY;
  let completed = 0;

  for (let top = 0; top < height; top += CORE) {
    for (let left = 0; left < width; left += CORE) {
      throwIfAborted(options.signal);
      const input = new Float32Array(3 * INPUT_TILE * INPUT_TILE);
      const plane = INPUT_TILE * INPUT_TILE;

      for (let y = 0; y < INPUT_TILE; y++) {
        const sourceY = reflectIndex(top + y - HALO, height);
        for (let x = 0; x < INPUT_TILE; x++) {
          const sourceX = reflectIndex(left + x - HALO, width);
          const sourceIndex = (sourceY * width + sourceX) * 4;
          const tileIndex = y * INPUT_TILE + x;
          // AMD's reference model expects RGB values in the 0..255 domain.
          input[tileIndex] = sourcePixels[sourceIndex];
          input[plane + tileIndex] = sourcePixels[sourceIndex + 1];
          input[2 * plane + tileIndex] = sourcePixels[sourceIndex + 2];
        }
      }

      const tensor = new ort.Tensor('float32', input, [1, 3, INPUT_TILE, INPUT_TILE]);
      const result = await prepared.session.run({ [prepared.session.inputNames[0]]: tensor });
      const resultTensor = result[prepared.session.outputNames[0]];
      const data = resultTensor.data as Float32Array;
      const outputPlane = OUTPUT_TILE * OUTPUT_TILE;
      const tileImage = new ImageData(OUTPUT_TILE, OUTPUT_TILE);
      for (let i = 0; i < outputPlane; i++) {
        tileImage.data[i * 4] = Math.max(0, Math.min(255, data[i]));
        tileImage.data[i * 4 + 1] = Math.max(0, Math.min(255, data[outputPlane + i]));
        tileImage.data[i * 4 + 2] = Math.max(0, Math.min(255, data[2 * outputPlane + i]));
        tileImage.data[i * 4 + 3] = 255;
      }
      tileContext.putImageData(tileImage, 0, 0);

      const coreWidth = Math.min(CORE, width - left);
      const coreHeight = Math.min(CORE, height - top);
      outputContext.drawImage(
        tileCanvas,
        OUTPUT_HALO,
        OUTPUT_HALO,
        coreWidth * SCALE,
        coreHeight * SCALE,
        left * SCALE,
        top * SCALE,
        coreWidth * SCALE,
        coreHeight * SCALE,
      );

      tensor.dispose?.();
      resultTensor.dispose?.();
      completed++;
      onProgress?.(completed / totalTiles, `Reconstructing detail · tile ${completed}/${totalTiles}`);
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    }
  }

  onProgress?.(1, '2× super-resolution complete');
  return output;
}
