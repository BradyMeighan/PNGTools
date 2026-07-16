import {
  BlobSource,
  BufferTarget,
  Conversion,
  Input,
  MATROSKA,
  MP4,
  Mp4OutputFormat,
  Output,
  QTFF,
  StreamTarget,
  VideoSample,
  WEBM,
  type StreamTargetChunk,
  type Target,
} from 'mediabunny';
import type { AiBackend, ModelLoadProgress } from '../onnx/session';
import type { LocalSaveHandle, VideoInfo } from './trim';
import { interpolateVideoSamples, prepareRife, RIFE_MODEL, type MotionDetail } from './rife';
import { prepareVideoSuperResolution, SESR_MODEL, upscaleVideoFrame2x } from './superResolution';

const FORMATS = [MP4, QTFF, WEBM, MATROSKA];
const MAX_BUFFER_BYTES = 384 * 1024 * 1024;

interface SavePickerWindow extends Window {
  showSaveFilePicker?: (options?: {
    suggestedName?: string;
    types?: Array<{ description?: string; accept: Record<string, string[]> }>;
  }) => Promise<LocalSaveHandle>;
}

export type AiVideoMode = 'fps' | 'upscale';
export type AiRenderPhase = 'model' | 'preparing' | 'processing' | 'encoding' | 'saving' | 'complete';

export interface AiRenderProgress {
  phase: AiRenderPhase;
  fraction: number;
  label: string;
  backend?: AiBackend;
  model?: ModelLoadProgress;
  sourceProgress?: number;
}

export interface AiVideoRenderOptions {
  mode: AiVideoMode;
  fpsMultiplier: 2 | 4;
  motionDetail: MotionDetail;
  sceneCutProtection: boolean;
  upscaleFactor: 2;
  saveHandle: LocalSaveHandle | null;
  signal?: AbortSignal;
  onProgress?: (progress: AiRenderProgress) => void;
}

export interface AiVideoRenderResult {
  outputName: string;
  outputBytes: number;
  savedDirectly: boolean;
  backend: AiBackend;
}

function abortError() {
  return new DOMException('AI video render canceled.', 'AbortError');
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw abortError();
}

function closeSample(sample: VideoSample | null) {
  sample?.close();
}

function makeInput(file: File) {
  return new Input({ source: new BlobSource(file), formats: FORMATS });
}

function triggerDownload(blob: Blob, outputName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = outputName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function supportsAiVideoRendering() {
  return typeof VideoDecoder !== 'undefined' && typeof VideoEncoder !== 'undefined';
}

export function getAiVideoName(fileName: string, mode: AiVideoMode, multiplier = 2) {
  const base = fileName.replace(/\.[^.]+$/, '') || 'video';
  return mode === 'fps' ? `${base}-smooth-${multiplier}x.mp4` : `${base}-ai-4k.mp4`;
}

export async function requestAiVideoSaveHandle(outputName: string) {
  const picker = (window as SavePickerWindow).showSaveFilePicker;
  if (!picker) return null;
  return picker.call(window, {
    suggestedName: outputName,
    types: [{ description: 'MP4 video', accept: { 'video/mp4': ['.mp4'] } }],
  });
}

function makeModelReporter(
  onProgress: AiVideoRenderOptions['onProgress'],
  setBackend: (backend: AiBackend) => void,
) {
  return (model: ModelLoadProgress) => {
    if (model.backend) setBackend(model.backend);
    onProgress?.({
      phase: 'model',
      fraction: Math.min(0.09, model.fraction * 0.09),
      label: model.label,
      backend: model.backend,
      model,
    });
  };
}

function estimateOutputBytes(info: VideoInfo, options: AiVideoRenderOptions) {
  const pixels = options.mode === 'upscale'
    ? info.width * options.upscaleFactor * info.height * options.upscaleFactor
    : info.width * info.height;
  const bitrate = Math.max(8_000_000, Math.min(45_000_000, pixels * 3));
  return Math.ceil((bitrate / 8) * info.duration * 1.08);
}

export async function renderAiVideo(
  file: File,
  info: VideoInfo,
  options: AiVideoRenderOptions,
): Promise<AiVideoRenderResult> {
  throwIfAborted(options.signal);
  if (!supportsAiVideoRendering()) {
    throw new Error('This browser cannot decode and encode video locally. Use a current Chrome or Edge browser.');
  }

  const outputWidth = options.mode === 'upscale' ? info.width * options.upscaleFactor : info.width;
  const outputHeight = options.mode === 'upscale' ? info.height * options.upscaleFactor : info.height;
  if (outputWidth > 8192 || outputHeight > 8192 || outputWidth * outputHeight > 34_000_000) {
    throw new Error('That upscale would exceed safe browser and hardware-encoder limits. Use a smaller source video.');
  }

  const estimatedBytes = estimateOutputBytes(info, options);
  if (!options.saveHandle && estimatedBytes > MAX_BUFFER_BYTES) {
    throw new Error('This render is too large for a safe in-memory download. Use Chrome or Edge so the app can save directly to disk.');
  }

  let backend: AiBackend = 'wasm';
  const setBackend = (next: AiBackend) => { backend = next; };
  const reportModel = makeModelReporter(options.onProgress, setBackend);

  if (options.mode === 'fps') {
    const prepared = await prepareRife(reportModel, options.signal);
    backend = prepared.backend;
  } else {
    const prepared = await prepareVideoSuperResolution(reportModel, options.signal);
    backend = prepared.backend;
  }
  throwIfAborted(options.signal);

  options.onProgress?.({
    phase: 'preparing',
    fraction: 0.1,
    label: 'Opening video and preparing hardware encoder',
    backend,
  });

  const outputName = getAiVideoName(file.name, options.mode, options.fpsMultiplier);
  const input = makeInput(file);
  let outputBytes = 0;
  let target: Target;
  let bufferTarget: BufferTarget | null = null;
  let previousSample: VideoSample | null = null;

  try {
    if (!(await input.canRead())) throw new Error('The video can no longer be read. Please choose it again.');

    if (options.saveHandle) {
      const writable = await options.saveHandle.createWritable();
      target = new StreamTarget(writable as WritableStream<StreamTargetChunk>, { chunked: true });
    } else {
      bufferTarget = new BufferTarget();
      target = bufferTarget;
    }
    target.on('write', ({ end }) => { outputBytes = Math.max(outputBytes, end); });

    const output = new Output({
      format: new Mp4OutputFormat({ fastStart: options.saveHandle ? false : 'in-memory' }),
      target,
    });

    const targetBitrate = Math.max(8_000_000, Math.min(45_000_000, outputWidth * outputHeight * 3));
    const frameCanvas = document.createElement('canvas');
    frameCanvas.width = info.width;
    frameCanvas.height = info.height;
    const frameContext = frameCanvas.getContext('2d')!;
    const interpolationTimes = Array.from(
      { length: options.fpsMultiplier - 1 },
      (_, index) => (index + 1) / options.fpsMultiplier,
    );

    const conversion = await Conversion.init({
      input,
      output,
      tracks: 'primary',
      video: {
        forceTranscode: true,
        hardwareAcceleration: 'prefer-hardware',
        bitrate: targetBitrate,
        processedWidth: outputWidth,
        processedHeight: outputHeight,
        process: async (sample) => {
          throwIfAborted(options.signal);
          const sourceProgress = Math.min(1, sample.timestamp / Math.max(0.001, info.duration));

          if (options.mode === 'upscale') {
            frameContext.clearRect(0, 0, info.width, info.height);
            sample.draw(frameContext, 0, 0, info.width, info.height);
            return upscaleVideoFrame2x(
              frameCanvas,
              (frameFraction, label) => options.onProgress?.({
                phase: 'processing',
                fraction: 0.12 + 0.8 * Math.min(1, sourceProgress + frameFraction / Math.max(1, info.duration * Math.max(1, info.fps))),
                label: `${label} · ${Math.round(sourceProgress * 100)}% through video`,
                backend,
                sourceProgress,
              }),
              { signal: options.signal, onBackend: setBackend },
            );
          }

          const currentForNext = sample.clone();
          const currentOutput = sample.clone();
          const isFinal = sample.timestamp + sample.duration >= info.duration - 0.002;
          currentOutput.setDuration(sample.duration / options.fpsMultiplier);
          // There is no process callback after EOF. Hold the final source frame
          // across its remaining interval so packet count and track duration both
          // reach the requested multiplier without inventing future motion.
          const finalTail = isFinal
            ? interpolationTimes.map((time) => {
                const tail = sample.clone();
                tail.setTimestamp(sample.timestamp + sample.duration * time);
                tail.setDuration(sample.duration / options.fpsMultiplier);
                return tail;
              })
            : [];

          if (!previousSample) {
            previousSample = currentForNext;
            options.onProgress?.({
              phase: 'processing',
              fraction: 0.12,
              label: 'Reading first frame pair',
              backend,
              sourceProgress: 0,
            });
            return finalTail.length > 0 ? [currentOutput, ...finalTail] : currentOutput;
          }

          const previous = previousSample;
          const interval = sample.timestamp - previous.timestamp;
          if (interval <= 0.000_001 || interval > 2) {
            previous.close();
            previousSample = currentForNext;
            return finalTail.length > 0 ? [currentOutput, ...finalTail] : currentOutput;
          }

          const interpolated = await interpolateVideoSamples(previous, sample, interpolationTimes, {
            detail: options.motionDetail,
            sceneCutProtection: options.sceneCutProtection,
            signal: options.signal,
            onBackend: setBackend,
            onProgress: (pairProgress, label) => options.onProgress?.({
              phase: 'processing',
              fraction: 0.12 + 0.8 * Math.min(1, sourceProgress + pairProgress / Math.max(1, info.duration * Math.max(1, info.fps))),
              label: interpolatedLabel(label, sourceProgress),
              backend,
              sourceProgress,
            }),
          });

          const inserted = interpolated.frames.map((canvas, index) => new VideoSample(canvas, {
            timestamp: previous.timestamp + interval * interpolationTimes[index],
            duration: interval / options.fpsMultiplier,
          }));
          previous.close();
          previousSample = currentForNext;
          return [...inserted, currentOutput, ...finalTail];
        },
      },
      audio: {},
      showWarnings: false,
    });

    const discardedEssentials = conversion.discardedTracks.filter(
      ({ track }) => track.type === 'video' || track.type === 'audio',
    );
    if (!conversion.isValid || discardedEssentials.some(({ track }) => track.type === 'video')) {
      const detail = discardedEssentials.map(({ reason }) => reason.replaceAll('_', ' ')).join(', ');
      throw new Error(`This browser cannot render this video${detail ? ` (${detail})` : ''}. Try Chrome or Edge with hardware acceleration enabled.`);
    }

    conversion.onProgress = (progress) => {
      if (progress > 0.995) {
        options.onProgress?.({ phase: 'encoding', fraction: 0.95, label: 'Finishing hardware encode', backend, sourceProgress: 1 });
      }
    };
    const cancel = () => void conversion.cancel();
    options.signal?.addEventListener('abort', cancel, { once: true });

    try {
      await conversion.execute();
      throwIfAborted(options.signal);
    } finally {
      options.signal?.removeEventListener('abort', cancel);
      closeSample(previousSample);
      previousSample = null;
    }

    options.onProgress?.({ phase: 'saving', fraction: 0.98, label: 'Writing final MP4', backend, sourceProgress: 1 });
    if (bufferTarget) {
      const buffer = bufferTarget.buffer;
      if (!buffer) throw new Error('The render finished without producing an MP4.');
      outputBytes = buffer.byteLength;
      triggerDownload(new Blob([buffer], { type: 'video/mp4' }), outputName);
    }

    options.onProgress?.({ phase: 'complete', fraction: 1, label: 'Render complete', backend, sourceProgress: 1 });
    return { outputName, outputBytes, savedDirectly: Boolean(options.saveHandle), backend };
  } finally {
    closeSample(previousSample);
    input.dispose();
  }
}

function interpolatedLabel(label: string, sourceProgress: number) {
  return `${label} · ${Math.round(sourceProgress * 100)}% through video`;
}

export const AI_VIDEO_MODELS = {
  fps: RIFE_MODEL,
  upscale: SESR_MODEL,
} as const;
