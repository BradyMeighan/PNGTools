import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Clock3,
  Download,
  FileVideo2,
  Gauge,
  HardDriveDownload,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Scissors,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { cn, formatSize } from '../../lib/utils';
import {
  exportTrimmedVideo,
  getTrimmedVideoName,
  inspectVideo,
  requestVideoSaveHandle,
  supportsDirectFileSave,
  type VideoInfo,
} from '../../lib/video/trim';

const MIN_CLIP_DURATION = 0.05;
const QUICK_END_CUTS = [1, 3, 5, 10];

type ToolStatus = 'idle' | 'analyzing' | 'exporting' | 'saved';

function formatTime(seconds: number, decimals = 1) {
  if (!Number.isFinite(seconds)) return '0:00.0';
  const safe = Math.max(0, seconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = (safe % 60).toFixed(decimals).padStart(decimals > 0 ? 4 : 2, '0');

  if (hours > 0) return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.padStart(decimals > 0 ? 4 : 2, '0')}`;
  return `${minutes}:${secs}`;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong while working with this video.';
}

function VideoDropzone({ onFile }: { onFile: (file: File) => void }) {
  const [dragging, setDragging] = useState(false);

  const takeFirstFile = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (file) onFile(file);
    },
    [onFile],
  );

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        takeFirstFile(event.dataTransfer.files);
      }}
      className={cn(
        'relative isolate min-h-64 overflow-hidden rounded-2xl border border-dashed transition-all duration-300',
        'flex cursor-pointer flex-col items-center justify-center gap-5 px-6 text-center',
        dragging
          ? 'scale-[1.01] border-primary bg-primary/10 shadow-[0_0_60px_rgba(42,190,198,0.12)]'
          : 'border-border bg-card/60 hover:border-primary/50 hover:bg-accent/40',
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 opacity-60"
        style={{
          backgroundImage:
            'radial-gradient(circle at 25% 20%, rgba(251,191,36,.14), transparent 34%), linear-gradient(rgba(255,255,255,.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.025) 1px, transparent 1px)',
          backgroundSize: 'auto, 28px 28px, 28px 28px',
        }}
      />
      <input
        type="file"
        accept="video/mp4,video/quicktime,video/webm,video/x-matroska,.mp4,.m4v,.mov,.webm,.mkv"
        className="absolute inset-0 z-10 cursor-pointer opacity-0"
        aria-label="Choose a video to trim"
        onChange={(event) => {
          takeFirstFile(event.target.files);
          event.currentTarget.value = '';
        }}
      />
      <div className="relative">
        <div className="absolute inset-0 scale-150 rounded-full bg-primary/20 blur-2xl" />
        <div className="relative rounded-2xl border border-primary/20 bg-primary/10 p-4 text-primary shadow-2xl">
          {dragging ? <FileVideo2 className="h-8 w-8" /> : <Upload className="h-8 w-8" />}
        </div>
      </div>
      <div>
        <p className="text-lg font-semibold text-white">{dragging ? 'Drop it here' : 'Drop a video or click to choose'}</p>
        <p className="mt-1.5 text-sm text-muted-foreground">MP4, MOV, WebM, or MKV · stays on this device</p>
      </div>
    </div>
  );
}

function TimeInput({
  label,
  value,
  max,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-canvas px-3 focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/10">
        <Clock3 className="h-3.5 w-3.5 text-muted-foreground" />
        <input
          type="number"
          min={0}
          max={max}
          step="0.01"
          value={Number(value.toFixed(2))}
          onChange={(event) => onChange(Number(event.target.value))}
          className="min-w-0 flex-1 bg-transparent py-2.5 font-mono text-sm text-white outline-none"
        />
        <span className="text-xs text-muted-foreground">sec</span>
      </div>
    </label>
  );
}

export function VideoTrimmerTool() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const exportControllerRef = useRef<AbortController | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [info, setInfo] = useState<VideoInfo | null>(null);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [playhead, setPlayhead] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const [status, setStatus] = useState<ToolStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setVideoUrl(null);
      return;
    }

    const url = URL.createObjectURL(file);
    setVideoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!file) return;

    let ignore = false;
    setStatus('analyzing');
    setInfo(null);
    setError(null);
    setSuccess(null);
    setPreviewError(false);

    void inspectVideo(file)
      .then((nextInfo) => {
        if (ignore) return;
        setInfo(nextInfo);
        setStart(0);
        setEnd(nextInfo.duration);
        setPlayhead(0);
        setStatus('idle');
      })
      .catch((nextError: unknown) => {
        if (ignore) return;
        setError(getErrorMessage(nextError));
        setFile(null);
        setStatus('idle');
      });

    return () => {
      ignore = true;
    };
  }, [file]);

  useEffect(
    () => () => {
      exportControllerRef.current?.abort();
    },
    [],
  );

  const selectFile = useCallback((nextFile: File) => {
    exportControllerRef.current?.abort();
    setFile(nextFile);
  }, []);

  const resetTool = useCallback(() => {
    exportControllerRef.current?.abort();
    videoRef.current?.pause();
    setIsPlaying(false);
    setFile(null);
    setInfo(null);
    setStart(0);
    setEnd(0);
    setPlayhead(0);
    setStatus('idle');
    setProgress(0);
    setError(null);
    setSuccess(null);
  }, []);

  const jumpTo = useCallback((time: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = time;
    setPlayhead(time);
  }, []);

  const updateStart = useCallback(
    (next: number) => {
      if (!info || !Number.isFinite(next)) return;
      const clamped = Math.max(0, Math.min(next, end - MIN_CLIP_DURATION));
      setStart(clamped);
      jumpTo(clamped);
      setSuccess(null);
    },
    [end, info, jumpTo],
  );

  const updateEnd = useCallback(
    (next: number) => {
      if (!info || !Number.isFinite(next)) return;
      const clamped = Math.min(info.duration, Math.max(next, start + MIN_CLIP_DURATION));
      setEnd(clamped);
      jumpTo(Math.max(start, clamped - 0.03));
      setSuccess(null);
    },
    [info, jumpTo, start],
  );

  const previewSelection = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;

    if (!video.paused) {
      video.pause();
      return;
    }

    if (video.currentTime < start || video.currentTime >= end - 0.03) {
      video.currentTime = start;
    }

    try {
      await video.play();
    } catch {
      // The native video element will expose playback errors in its own controls.
    }
  }, [end, start]);

  const handleExport = useCallback(async () => {
    if (!file || !info || status === 'exporting') return;

    const outputName = getTrimmedVideoName(file.name, info.extension);

    try {
      // Ask for the destination immediately while the click still counts as a user gesture.
      const saveHandle = await requestVideoSaveHandle(info, outputName);
      const controller = new AbortController();
      exportControllerRef.current = controller;
      setStatus('exporting');
      setProgress(0);
      setError(null);
      setSuccess(null);

      const result = await exportTrimmedVideo(file, info, {
        start,
        end,
        saveHandle,
        signal: controller.signal,
        onProgress: setProgress,
      });

      setProgress(1);
      setStatus('saved');
      setSuccess(
        `${result.savedDirectly ? 'Saved' : 'Downloaded'} ${result.outputName} · ${formatSize(result.outputBytes)}`,
      );
    } catch (nextError: unknown) {
      if (isAbortError(nextError)) {
        setStatus('idle');
        return;
      }
      setError(getErrorMessage(nextError));
      setStatus('idle');
    } finally {
      exportControllerRef.current = null;
    }
  }, [end, file, info, start, status]);

  const cancelExport = useCallback(() => {
    exportControllerRef.current?.abort();
  }, []);

  const keepDuration = Math.max(0, end - start);
  const removedFromEnd = info ? Math.max(0, info.duration - end) : 0;
  const estimatedSize = info && file ? Math.round(file.size * (keepDuration / info.duration)) : 0;
  const isFastEndCut = start <= 0.001;

  const timelineStyle = useMemo(() => {
    if (!info) return { left: '0%', right: '0%' };
    return {
      left: `${(start / info.duration) * 100}%`,
      right: `${100 - (end / info.duration) * 100}%`,
    };
  }, [end, info, start]);

  const playheadPosition = info ? Math.min(100, Math.max(0, (playhead / info.duration) * 100)) : 0;

  if (!file || !info) {
    return (
      <section className="mx-auto mt-8 max-w-3xl" aria-labelledby="video-trimmer-title">
        <div className="mb-9 text-center">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
            <Scissors className="h-3.5 w-3.5" /> Local video cutter
          </div>
          <h2 id="video-trimmer-title" className="text-4xl font-bold tracking-[-0.04em] text-white sm:text-5xl">
            Lose the ending. Keep the quality.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Cut a few seconds—or pull out a clean slice—without creating a project, uploading the file, or waiting on a server.
          </p>
        </div>

        {error && (
          <div role="alert" className="mb-4 rounded-xl border border-red-400/25 bg-red-400/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {status === 'analyzing' && file ? (
          <div className="flex min-h-64 flex-col items-center justify-center gap-4 rounded-2xl border border-border bg-card">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <div className="text-center">
              <p className="font-medium text-white">Reading {file.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">Checking duration, tracks, and export format…</p>
            </div>
          </div>
        ) : (
          <VideoDropzone onFile={selectFile} />
        )}

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {[
            { icon: Gauge, label: 'End trims skip rendering', detail: 'Near file-copy speed' },
            { icon: ShieldCheck, label: 'Nothing gets uploaded', detail: 'Private by design' },
            { icon: Sparkles, label: 'No quality loss', detail: 'Original packets preserved' },
          ].map(({ icon: Icon, label, detail }) => (
            <div key={label} className="rounded-xl border border-border bg-card p-4">
              <Icon className="mb-3 h-4 w-4 text-primary" />
              <p className="text-sm font-medium text-foreground">{label}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-7xl" aria-labelledby="video-workspace-title" aria-busy={status === 'exporting'}>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_10px_rgba(42,190,198,.9)]" />
            Local editing bay
          </div>
          <h2 id="video-workspace-title" className="text-3xl font-bold tracking-tight text-white">Trim video</h2>
          <p className="mt-1 max-w-2xl truncate text-sm text-muted-foreground" title={file.name}>{file.name}</p>
        </div>
        <button
          type="button"
          onClick={resetTool}
          disabled={status === 'exporting'}
          className="inline-flex items-center justify-center gap-2 self-start rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground transition hover:border-primary/40 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40 sm:self-auto"
        >
          <X className="h-4 w-4" /> Choose another
        </button>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          <div className="overflow-hidden rounded-2xl border border-border bg-canvas shadow-2xl shadow-black/30">
            <div className="relative flex min-h-[280px] items-center justify-center bg-black sm:min-h-[420px]">
              {videoUrl && !previewError ? (
                <video
                  ref={videoRef}
                  src={videoUrl}
                  controls
                  preload="metadata"
                  playsInline
                  className="max-h-[65vh] w-full object-contain"
                  onError={() => setPreviewError(true)}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onEnded={() => setIsPlaying(false)}
                  onTimeUpdate={(event) => {
                    const video = event.currentTarget;
                    setPlayhead(video.currentTime);
                    if (!video.paused && video.currentTime >= end - 0.015) {
                      video.pause();
                      video.currentTime = end;
                    }
                  }}
                  onSeeked={(event) => setPlayhead(event.currentTarget.currentTime)}
                />
              ) : (
                <div className="max-w-md px-8 text-center">
                  <FileVideo2 className="mx-auto h-10 w-10 text-muted-foreground/50" />
                  <p className="mt-4 font-medium text-foreground">This browser cannot preview the video codec.</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    You can still trim it with the time controls below. End-only cuts do not need the browser to decode the video.
                  </p>
                </div>
              )}
              <div className="pointer-events-none absolute left-3 top-3 rounded-md border border-border bg-canvas/80 px-2 py-1 font-mono text-[11px] text-foreground backdrop-blur">
                {info.width}×{info.height} · {info.videoCodec.toUpperCase()}
              </div>
            </div>

            <div className="border-t border-border bg-surface p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void previewSelection()}
                    disabled={previewError}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-2.5 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 fill-current" />}
                    Preview cut
                  </button>
                  <button
                    type="button"
                    onClick={() => updateEnd(playhead)}
                    className="hidden rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition hover:border-primary/40 hover:text-primary sm:block"
                  >
                    End at playhead
                  </button>
                </div>
                <div className="font-mono text-xs text-muted-foreground">
                  <span className="text-foreground">{formatTime(playhead)}</span> / {formatTime(info.duration)}
                </div>
              </div>

              <div className="relative h-12" aria-label="Video trim range">
                <div
                  className="absolute left-0 right-0 top-3 h-6 overflow-hidden rounded-md border border-border bg-canvas/70"
                  style={{
                    backgroundImage:
                      'repeating-linear-gradient(90deg, rgba(255,255,255,.08) 0, rgba(255,255,255,.08) 1px, transparent 1px, transparent 8%)',
                  }}
                >
                  <div className="absolute inset-y-0 bg-primary/80 shadow-[0_0_24px_rgba(42,190,198,.3)]" style={timelineStyle} />
                  <div
                    className="absolute inset-y-0 w-px bg-white shadow-[0_0_8px_rgba(255,255,255,.7)]"
                    style={{ left: `${playheadPosition}%` }}
                  />
                </div>
                <input
                  type="range"
                  min={0}
                  max={info.duration}
                  step="0.01"
                  value={start}
                  onChange={(event) => updateStart(Number(event.target.value))}
                  className="timeline-range"
                  aria-label="Keep from"
                />
                <input
                  type="range"
                  min={0}
                  max={info.duration}
                  step="0.01"
                  value={end}
                  onChange={(event) => updateEnd(Number(event.target.value))}
                  className="timeline-range"
                  aria-label="Keep until"
                />
              </div>

              <div className="mt-1 flex justify-between font-mono text-[10px] text-muted-foreground">
                <span>0:00</span>
                <span>{formatTime(info.duration)}</span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="grid flex-1 grid-cols-2 gap-3">
                <TimeInput label="Keep from" value={start} max={Math.max(0, end - MIN_CLIP_DURATION)} onChange={updateStart} />
                <TimeInput label="Keep until" value={end} max={info.duration} onChange={updateEnd} />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => updateStart(playhead)}
                  className="flex-1 whitespace-nowrap rounded-lg border border-border px-3 py-2.5 text-xs text-muted-foreground transition hover:border-primary/40 hover:text-foreground sm:flex-none"
                >
                  Start at playhead
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStart(0);
                    setEnd(info.duration);
                    jumpTo(0);
                    setSuccess(null);
                  }}
                  className="rounded-lg border border-border p-2.5 text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
                  aria-label="Reset trim range"
                  title="Reset trim range"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-primary/20 bg-gradient-to-b from-primary/[0.07] to-transparent p-5">
            <div className="mb-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Quick end cut</p>
              <p className="mt-1 text-sm text-muted-foreground">The thing you came here to do.</p>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {QUICK_END_CUTS.map((seconds) => (
                <button
                  key={seconds}
                  type="button"
                  disabled={info.duration <= seconds + MIN_CLIP_DURATION}
                  onClick={() => {
                    const nextEnd = Math.max(MIN_CLIP_DURATION, info.duration - seconds);
                    setStart(0);
                    setEnd(nextEnd);
                    jumpTo(Math.max(0, nextEnd - 0.03));
                    setSuccess(null);
                  }}
                  className="rounded-lg border border-primary/20 bg-primary/[0.06] py-2.5 font-mono text-xs font-semibold text-primary transition hover:border-primary/50 hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  −{seconds}s
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-start gap-3">
              <div className={cn('rounded-lg p-2', isFastEndCut ? 'bg-emerald-400/10 text-emerald-300' : 'bg-sky-400/10 text-sky-300')}>
                {isFastEndCut ? <Gauge className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{isFastEndCut ? 'Lossless fast cut' : 'Frame-precise slice'}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {isFastEndCut
                    ? 'Copies the original video and audio packets. No render and no quality loss.'
                    : 'A non-zero start needs re-encoding. It stays local and uses hardware acceleration when the browser provides it.'}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="grid grid-cols-2 gap-x-4 gap-y-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Keeping</p>
                <p className="mt-1 font-mono text-sm text-white">{formatTime(keepDuration)}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Removing</p>
                <p className="mt-1 font-mono text-sm text-white">{formatTime(start + removedFromEnd)}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Est. size</p>
                <p className="mt-1 font-mono text-sm text-white">≈ {formatSize(estimatedSize)}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Format</p>
                <p className="mt-1 font-mono text-sm text-white">{info.containerLabel}</p>
              </div>
            </div>
            <div className="mt-4 border-t border-border pt-4 text-xs text-muted-foreground">
              {formatSize(file.size)} original · {info.audioCodec ? `${info.audioCodec.toUpperCase()} audio` : 'no audio track'}
            </div>
          </div>

          {error && (
            <div role="alert" className="rounded-xl border border-red-400/25 bg-red-400/10 px-4 py-3 text-sm leading-relaxed text-red-200">
              {error}
            </div>
          )}

          {success && (
            <div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
              <Check className="mt-0.5 h-4 w-4 shrink-0" /> {success}
            </div>
          )}

          {status === 'exporting' ? (
            <div className="rounded-2xl border border-primary/20 bg-primary/[0.06] p-5" aria-live="polite">
              <div className="mb-3 flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 font-medium text-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Exporting locally
                </span>
                <span className="font-mono text-primary">{Math.round(progress * 100)}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-black/30">
                <div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${progress * 100}%` }} />
              </div>
              <button type="button" onClick={cancelExport} className="mt-4 w-full text-xs text-muted-foreground transition hover:text-foreground">
                Cancel export
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void handleExport()}
              disabled={keepDuration < MIN_CLIP_DURATION}
              className="group flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 font-semibold text-primary-foreground shadow-[0_14px_40px_rgba(42,190,198,.15)] transition hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-[0_18px_50px_rgba(42,190,198,.23)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {supportsDirectFileSave() ? <HardDriveDownload className="h-4 w-4" /> : <Download className="h-4 w-4" />}
              Save trimmed video
            </button>
          )}

          <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" /> Processed entirely on this device
          </p>
        </aside>
      </div>
    </section>
  );
}
