import { type VideoSample } from 'mediabunny';
import {
  createAiSession,
  getOrt,
  type AiBackend,
  type AiSession,
  type ModelProgressFn,
  type ModelSpec,
} from '../onnx/session';

export const RIFE_MODEL: ModelSpec = {
  id: 'rife-v4.9',
  label: 'RIFE v4.9',
  url: '/models/rife-v4.9.onnx',
  bytes: 21_367_656,
};

let sessionPromise: Promise<AiSession> | null = null;

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('AI processing canceled.', 'AbortError');
}

export async function prepareRife(
  onProgress?: ModelProgressFn,
  signal?: AbortSignal,
): Promise<AiSession> {
  throwIfAborted(signal);
  if (!sessionPromise) {
    sessionPromise = createAiSession(RIFE_MODEL, onProgress, signal).catch((error) => {
      sessionPromise = null;
      throw error;
    });
  } else {
    onProgress?.({
      phase: 'checking',
      fraction: 0.15,
      label: 'Opening cached RIFE model',
      cached: true,
    });
  }

  const prepared = await sessionPromise;
  throwIfAborted(signal);
  onProgress?.({
    phase: 'ready',
    fraction: 1,
    label: prepared.backend === 'webgpu' ? 'RIFE ready on GPU' : 'RIFE ready on CPU',
    cached: true,
    backend: prepared.backend,
  });
  return prepared;
}

export type MotionDetail = 'balanced' | 'full';

export interface InterpolationOptions {
  detail: MotionDetail;
  sceneCutProtection: boolean;
  signal?: AbortSignal;
  onProgress?: (fraction: number, label: string) => void;
  onBackend?: (backend: AiBackend) => void;
}

export interface InterpolationResult {
  frames: HTMLCanvasElement[];
  sceneCut: boolean;
}

function nextMultiple(value: number, multiple: number) {
  return Math.ceil(value / multiple) * multiple;
}

function drawSample(sample: VideoSample, width: number, height: number, paddedWidth: number, paddedHeight: number) {
  const canvas = document.createElement('canvas');
  canvas.width = paddedWidth;
  canvas.height = paddedHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.fillStyle = '#000';
  context.fillRect(0, 0, paddedWidth, paddedHeight);
  sample.draw(context, 0, 0, width, height);
  return { canvas, context, pixels: context.getImageData(0, 0, paddedWidth, paddedHeight) };
}

function isHardCut(a: Uint8ClampedArray, b: Uint8ClampedArray) {
  // Sampling every fourth pixel is enough to identify a cut and avoids another
  // full-resolution pass over two large frames.
  let difference = 0;
  let count = 0;
  for (let i = 0; i < a.length; i += 16) {
    difference += Math.abs(a[i] - b[i]);
    difference += Math.abs(a[i + 1] - b[i + 1]);
    difference += Math.abs(a[i + 2] - b[i + 2]);
    count += 3;
  }
  return difference / Math.max(1, count * 255) > 0.24;
}

function sourceFrameCanvas(sample: VideoSample, width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  sample.draw(canvas.getContext('2d')!, 0, 0, width, height);
  return canvas;
}

export async function interpolateVideoSamples(
  previous: VideoSample,
  current: VideoSample,
  times: number[],
  options: InterpolationOptions,
): Promise<InterpolationResult> {
  throwIfAborted(options.signal);
  const prepared = await prepareRife(undefined, options.signal);
  options.onBackend?.(prepared.backend);

  const outputWidth = current.displayWidth;
  const outputHeight = current.displayHeight;
  const maxAnalysisEdge = options.detail === 'full' ? Infinity : 1280;
  const cpuMaxEdge = prepared.backend === 'wasm' ? 960 : Infinity;
  const analysisScale = Math.min(1, maxAnalysisEdge / Math.max(outputWidth, outputHeight), cpuMaxEdge / Math.max(outputWidth, outputHeight));
  const analysisWidth = Math.max(64, Math.round(outputWidth * analysisScale));
  const analysisHeight = Math.max(64, Math.round(outputHeight * analysisScale));
  // The validated export expects spatial dimensions padded to a multiple of 64.
  const paddedWidth = nextMultiple(analysisWidth, 64);
  const paddedHeight = nextMultiple(analysisHeight, 64);

  options.onProgress?.(0.04, 'Reading adjacent frames');
  const a = drawSample(previous, analysisWidth, analysisHeight, paddedWidth, paddedHeight);
  const b = drawSample(current, analysisWidth, analysisHeight, paddedWidth, paddedHeight);
  const sceneCut = options.sceneCutProtection && isHardCut(a.pixels.data, b.pixels.data);

  if (sceneCut) {
    options.onProgress?.(1, 'Scene cut protected');
    return {
      sceneCut: true,
      frames: times.map((time) => sourceFrameCanvas(time < 0.5 ? previous : current, outputWidth, outputHeight)),
    };
  }

  const plane = paddedWidth * paddedHeight;
  const input = new Float32Array(7 * plane);
  const aPixels = a.pixels.data;
  const bPixels = b.pixels.data;
  for (let i = 0; i < plane; i++) {
    input[i] = aPixels[i * 4] / 255;
    input[plane + i] = aPixels[i * 4 + 1] / 255;
    input[2 * plane + i] = aPixels[i * 4 + 2] / 255;
    input[3 * plane + i] = bPixels[i * 4] / 255;
    input[4 * plane + i] = bPixels[i * 4 + 1] / 255;
    input[5 * plane + i] = bPixels[i * 4 + 2] / 255;
  }

  const ort = await getOrt();
  const frames: HTMLCanvasElement[] = [];
  for (let index = 0; index < times.length; index++) {
    throwIfAborted(options.signal);
    const time = times[index];
    input.fill(time, 6 * plane);
    const tensor = new ort.Tensor('float32', input, [1, 7, paddedHeight, paddedWidth]);
    const result = await prepared.session.run({ [prepared.session.inputNames[0]]: tensor });
    const resultTensor = result[prepared.session.outputNames[0]];
    const data = resultTensor.data as Float32Array;
    const reconstructed = new ImageData(paddedWidth, paddedHeight);

    for (let i = 0; i < plane; i++) {
      reconstructed.data[i * 4] = Math.max(0, Math.min(255, data[i] * 255));
      reconstructed.data[i * 4 + 1] = Math.max(0, Math.min(255, data[plane + i] * 255));
      reconstructed.data[i * 4 + 2] = Math.max(0, Math.min(255, data[2 * plane + i] * 255));
      reconstructed.data[i * 4 + 3] = 255;
    }

    const analysisCanvas = document.createElement('canvas');
    analysisCanvas.width = paddedWidth;
    analysisCanvas.height = paddedHeight;
    analysisCanvas.getContext('2d')!.putImageData(reconstructed, 0, 0);

    const output = document.createElement('canvas');
    output.width = outputWidth;
    output.height = outputHeight;
    const outputContext = output.getContext('2d')!;
    outputContext.imageSmoothingEnabled = true;
    outputContext.imageSmoothingQuality = 'high';
    outputContext.drawImage(
      analysisCanvas,
      0,
      0,
      analysisWidth,
      analysisHeight,
      0,
      0,
      outputWidth,
      outputHeight,
    );
    frames.push(output);
    tensor.dispose?.();
    resultTensor.dispose?.();
    options.onProgress?.(
      0.08 + 0.9 * ((index + 1) / times.length),
      `Generating in-between frame ${index + 1}/${times.length}`,
    );
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  }

  options.onProgress?.(1, 'In-between frames ready');
  return { frames, sceneCut: false };
}
