import {
  BlobSource,
  BufferTarget,
  Conversion,
  EncodedAudioPacketSource,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  Input,
  MATROSKA,
  MP4,
  MkvOutputFormat,
  MovOutputFormat,
  Mp4OutputFormat,
  Output,
  QTFF,
  StreamTarget,
  WEBM,
  WebMOutputFormat,
  type OutputFormat,
  type StreamTargetChunk,
  type Target,
} from 'mediabunny';

export type VideoContainer = 'mp4' | 'mov' | 'webm' | 'mkv';

export interface VideoInfo {
  container: VideoContainer;
  containerLabel: string;
  extension: VideoContainer;
  mimeType: string;
  duration: number;
  width: number;
  height: number;
  videoCodec: string;
  audioCodec: string | null;
  fps: number;
}

export interface LocalSaveHandle {
  createWritable: () => Promise<WritableStream<StreamTargetChunk>>;
}

interface SavePickerWindow extends Window {
  showSaveFilePicker?: (options?: {
    suggestedName?: string;
    types?: Array<{
      description?: string;
      accept: Record<string, string[]>;
    }>;
  }) => Promise<LocalSaveHandle>;
}

export interface TrimExportOptions {
  start: number;
  end: number;
  saveHandle: LocalSaveHandle | null;
  signal?: AbortSignal;
  onProgress?: (progress: number) => void;
}

export interface TrimExportResult {
  outputName: string;
  outputBytes: number;
  savedDirectly: boolean;
}

const STREAM_TO_DISK_THRESHOLD = 128 * 1024 * 1024;
const MAX_BUFFER_FALLBACK = 384 * 1024 * 1024;
const MIN_CLIP_DURATION = 0.05;
const SUPPORTED_FORMATS = [MP4, QTFF, WEBM, MATROSKA];

function makeInput(file: File) {
  return new Input({
    source: new BlobSource(file),
    formats: SUPPORTED_FORMATS,
  });
}

function getContainerInfo(format: Awaited<ReturnType<Input['getFormat']>>): Omit<VideoInfo, 'duration' | 'width' | 'height' | 'videoCodec' | 'audioCodec' | 'fps'> {
  if (format === MP4) {
    return { container: 'mp4', containerLabel: 'MP4', extension: 'mp4', mimeType: 'video/mp4' };
  }
  if (format === QTFF) {
    return { container: 'mov', containerLabel: 'QuickTime', extension: 'mov', mimeType: 'video/quicktime' };
  }
  if (format === WEBM) {
    return { container: 'webm', containerLabel: 'WebM', extension: 'webm', mimeType: 'video/webm' };
  }
  if (format === MATROSKA) {
    return { container: 'mkv', containerLabel: 'Matroska', extension: 'mkv', mimeType: 'video/x-matroska' };
  }

  throw new Error('This video container is not supported yet. Try MP4, MOV, WebM, or MKV.');
}

function makeOutputFormat(container: VideoContainer, streaming: boolean): OutputFormat {
  switch (container) {
    case 'mp4':
      return new Mp4OutputFormat({ fastStart: streaming ? false : 'in-memory' });
    case 'mov':
      return new MovOutputFormat({ fastStart: streaming ? false : 'in-memory' });
    case 'webm':
      return new WebMOutputFormat();
    case 'mkv':
      return new MkvOutputFormat();
  }
}

export function getTrimmedVideoName(fileName: string, extension: string) {
  const base = fileName.replace(/\.[^.]+$/, '') || 'video';
  return `${base}-trimmed.${extension}`;
}

export function supportsDirectFileSave() {
  return typeof (window as SavePickerWindow).showSaveFilePicker === 'function';
}

export async function requestVideoSaveHandle(info: VideoInfo, outputName: string) {
  const picker = (window as SavePickerWindow).showSaveFilePicker;
  if (!picker) return null;

  return picker.call(window, {
    suggestedName: outputName,
    types: [
      {
        description: `${info.containerLabel} video`,
        accept: { [info.mimeType]: [`.${info.extension}`] },
      },
    ],
  });
}

export async function inspectVideo(file: File): Promise<VideoInfo> {
  const input = makeInput(file);

  try {
    if (!(await input.canRead())) {
      throw new Error('That file does not look like a supported video. Try MP4, MOV, WebM, or MKV.');
    }

    const format = await input.getFormat();
    const containerInfo = getContainerInfo(format);
    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) throw new Error('No video track was found in this file.');

    const audioTrack = await input.getPrimaryAudioTrack();
    const metadataDuration = await input.getDurationFromMetadata();
    const [duration, width, height, videoCodec, audioCodec, packetStats] = await Promise.all([
      metadataDuration ?? input.computeDuration(),
      videoTrack.getDisplayWidth(),
      videoTrack.getDisplayHeight(),
      videoTrack.getCodec(),
      audioTrack?.getCodec() ?? null,
      videoTrack.computePacketStats(120),
    ]);

    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error('The video duration could not be read. The file may be incomplete.');
    }

    return {
      ...containerInfo,
      duration,
      width,
      height,
      videoCodec: videoCodec ?? 'unknown',
      audioCodec,
      fps: packetStats.averagePacketRate,
    };
  } finally {
    input.dispose();
  }
}

function triggerDownload(blob: Blob, outputName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = outputName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function makeAbortError() {
  return new DOMException('Video export canceled.', 'AbortError');
}

async function executeLosslessEndTrim(
  input: Input,
  output: Output,
  end: number,
  signal: AbortSignal | undefined,
  onProgress: ((progress: number) => void) | undefined,
) {
  const videoTrack = await input.getPrimaryVideoTrack();
  if (!videoTrack) throw new Error('No video track was found in this file.');

  const audioTrack = await input.getPrimaryAudioTrack();
  const videoCodec = await videoTrack.getCodec();
  if (!videoCodec || !output.format.getSupportedVideoCodecs().includes(videoCodec)) {
    throw new Error('This video codec cannot be copied into the original container.');
  }

  const videoSource = new EncodedVideoPacketSource(videoCodec);
  output.addVideoTrack(videoSource, { rotation: await videoTrack.getRotation() });

  let audioSource: EncodedAudioPacketSource | null = null;
  if (audioTrack) {
    const audioCodec = await audioTrack.getCodec();
    if (!audioCodec || !output.format.getSupportedAudioCodecs().includes(audioCodec)) {
      throw new Error('This audio codec cannot be copied into the original container.');
    }

    audioSource = new EncodedAudioPacketSource(audioCodec);
    output.addAudioTrack(audioSource);
  }

  const progressByTrack = new Map<'video' | 'audio', number>();
  const reportProgress = (track: 'video' | 'audio', timestamp: number) => {
    progressByTrack.set(track, timestamp);
    const furthestTimestamp = Math.max(0, ...progressByTrack.values());
    onProgress?.(Math.min(1, furthestTimestamp / end));
  };

  await output.start();

  try {
    const copyVideo = async () => {
      const sink = new EncodedPacketSink(videoTrack);
      const decoderConfig = await videoTrack.getDecoderConfig();
      const metadata: EncodedVideoChunkMetadata = { decoderConfig: decoderConfig ?? undefined };

      try {
        for await (const packet of sink.packets(undefined, undefined, { verifyKeyPackets: true })) {
          if (signal?.aborted) throw makeAbortError();
          if (packet.timestamp >= end) break;

          const packetEnd = packet.timestamp + packet.duration;
          if (packetEnd <= 0) continue;
          const normalizedPacket = packet.timestamp < 0
            ? packet.clone({ timestamp: 0, duration: packetEnd })
            : packet;

          await videoSource.add(normalizedPacket, metadata);
          reportProgress('video', normalizedPacket.timestamp + normalizedPacket.duration);
        }
      } finally {
        videoSource.close();
      }
    };

    const copyAudio = async () => {
      if (!audioTrack || !audioSource) return;
      const sink = new EncodedPacketSink(audioTrack);
      const decoderConfig = await audioTrack.getDecoderConfig();
      const metadata: EncodedAudioChunkMetadata = { decoderConfig: decoderConfig ?? undefined };

      try {
        for await (const packet of sink.packets()) {
          if (signal?.aborted) throw makeAbortError();
          if (packet.timestamp >= end) break;

          const packetEnd = packet.timestamp + packet.duration;
          // AAC and a few other codecs can contain a priming packet ending at
          // time zero. It is safe to omit that invisible packet while copying
          // every presented packet byte-for-byte.
          if (packetEnd <= 0) continue;
          const normalizedPacket = packet.timestamp < 0
            ? packet.clone({ timestamp: 0, duration: packetEnd })
            : packet;

          await audioSource.add(normalizedPacket, metadata);
          reportProgress('audio', normalizedPacket.timestamp + normalizedPacket.duration);
        }
      } finally {
        audioSource.close();
      }
    };

    await Promise.all([copyVideo(), copyAudio()]);
    if (signal?.aborted) throw makeAbortError();
    await output.finalize();
    onProgress?.(1);
  } catch (error) {
    await output.cancel();
    throw error;
  }
}

export async function exportTrimmedVideo(
  file: File,
  info: VideoInfo,
  options: TrimExportOptions,
): Promise<TrimExportResult> {
  const start = Math.max(0, Math.min(options.start, info.duration - MIN_CLIP_DURATION));
  const end = Math.min(info.duration, Math.max(options.end, start + MIN_CLIP_DURATION));
  if (options.signal?.aborted) throw makeAbortError();

  const keptRatio = Math.max(0, end - start) / info.duration;
  const estimatedOutputBytes = Math.ceil(file.size * keptRatio);
  const shouldStream = Boolean(options.saveHandle && estimatedOutputBytes >= STREAM_TO_DISK_THRESHOLD);

  if (!options.saveHandle && estimatedOutputBytes > MAX_BUFFER_FALLBACK) {
    throw new Error(
      'This output is too large for a safe in-memory download in this browser. Open the tool in Chrome or Edge to save it directly to disk.',
    );
  }

  const input = makeInput(file);
  let outputBytes = 0;
  let target: Target;
  let bufferTarget: BufferTarget | null = null;

  try {
    if (!(await input.canRead())) throw new Error('The video can no longer be read. Please choose it again.');

    if (shouldStream && options.saveHandle) {
      const writable = await options.saveHandle.createWritable();
      target = new StreamTarget(writable, { chunked: true });
    } else {
      bufferTarget = new BufferTarget();
      target = bufferTarget;
    }

    target.on('write', ({ end: writtenEnd }) => {
      outputBytes = Math.max(outputBytes, writtenEnd);
    });

    const output = new Output({
      format: makeOutputFormat(info.container, shouldStream),
      target,
    });

    if (start <= 0.001) {
      await executeLosslessEndTrim(input, output, end, options.signal, options.onProgress);
    } else {
      const conversion = await Conversion.init({
        input,
        output,
        tracks: 'primary',
        trim: { start, end },
        video: { hardwareAcceleration: 'no-preference' },
        showWarnings: false,
      });

      const discardedEssentials = conversion.discardedTracks.filter(
        ({ track }) => track.type === 'video' || track.type === 'audio',
      );
      if (!conversion.isValid || discardedEssentials.length > 0) {
        const reasons = discardedEssentials.map(({ reason }) => reason.replaceAll('_', ' '));
        const detail = reasons.length > 0 ? ` (${[...new Set(reasons)].join(', ')})` : '';
        throw new Error(
          `This browser cannot export this exact slice${detail}. For a lossless end trim, leave “Keep from” at 0:00.`,
        );
      }

      conversion.onProgress = (progress) => options.onProgress?.(progress);

      const abort = () => void conversion.cancel();
      options.signal?.addEventListener('abort', abort, { once: true });

      try {
        if (options.signal?.aborted) throw makeAbortError();
        await conversion.execute();
        if (options.signal?.aborted) throw makeAbortError();
      } finally {
        options.signal?.removeEventListener('abort', abort);
      }
    }

    const outputName = getTrimmedVideoName(file.name, info.extension);

    if (bufferTarget) {
      const buffer = bufferTarget.buffer;
      if (!buffer) throw new Error('The export finished without producing a file.');

      outputBytes = buffer.byteLength;
      if (options.saveHandle) {
        const writable = await options.saveHandle.createWritable();
        const writer = writable.getWriter();
        await writer.write({ type: 'write', data: new Uint8Array(buffer), position: 0 });
        await writer.close();
      } else {
        triggerDownload(new Blob([buffer], { type: info.mimeType }), outputName);
      }
    }

    return {
      outputName,
      outputBytes,
      savedDirectly: Boolean(options.saveHandle),
    };
  } finally {
    input.dispose();
  }
}
