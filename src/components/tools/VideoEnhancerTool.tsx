import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Clapperboard,
  Cpu,
  Download,
  Film,
  Gauge,
  HardDriveDownload,
  Layers3,
  Loader2,
  MonitorUp,
  ScanLine,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  Wand2,
  X,
  Zap,
} from 'lucide-react';
import { cn, formatSize } from '../../lib/utils';
import { getPreferredAiBackend } from '../../lib/onnx/session';
import {
  AI_VIDEO_MODELS,
  getAiVideoName,
  renderAiVideo,
  requestAiVideoSaveHandle,
  supportsAiVideoRendering,
  type AiRenderProgress,
  type AiVideoMode,
  type AiVideoRenderResult,
} from '../../lib/video/enhance';
import { inspectVideo, supportsDirectFileSave, type VideoInfo } from '../../lib/video/trim';
import type { MotionDetail } from '../../lib/video/rife';

type LoadStatus = 'idle' | 'inspecting' | 'ready' | 'rendering' | 'done' | 'error';

function formatDuration(seconds: number) {
  const rounded = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(rounded / 60);
  return `${minutes}:${String(rounded % 60).padStart(2, '0')}`;
}

function formatFps(fps: number) {
  if (!Number.isFinite(fps) || fps <= 0) return '—';
  return fps >= 10 ? fps.toFixed(1).replace(/\.0$/, '') : fps.toFixed(2);
}

function modelProgressText(progress: AiRenderProgress | null) {
  const model = progress?.model;
  if (!model?.loadedBytes || !model.totalBytes) return progress?.label ?? 'Model loads when you render';
  return `${model.label} · ${formatSize(model.loadedBytes)} / ${formatSize(model.totalBytes)}`;
}

function VideoDropzone({ onFile, busy }: { onFile: (file: File) => void; busy: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => inputRef.current?.click()}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const file = event.dataTransfer.files[0];
        if (file) onFile(file);
      }}
      className={cn(
        'group relative flex min-h-[230px] w-full flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed px-6 text-center transition duration-300',
        dragging
          ? 'border-primary bg-primary/10 shadow-[0_0_60px_hsl(var(--primary)/.12)]'
          : 'border-border bg-card/70 hover:border-primary/60 hover:bg-card',
      )}
    >
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept="video/mp4,video/quicktime,video/webm,.mkv"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
          event.currentTarget.value = '';
        }}
      />
      <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(hsl(var(--border)/.35)_1px,transparent_1px),linear-gradient(90deg,hsl(var(--border)/.35)_1px,transparent_1px)] [background-size:32px_32px] [mask-image:radial-gradient(circle_at_center,black,transparent_72%)]" />
      <div className="relative mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary transition group-hover:-translate-y-1 group-hover:border-primary/40">
        {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <UploadCloud className="h-6 w-6" />}
      </div>
      <p className="relative font-display text-xl font-semibold text-foreground">
        {busy ? 'Reading video…' : dragging ? 'Drop it here' : 'Choose or drop a video'}
      </p>
      <p className="relative mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
        MP4, MOV, WebM, or MKV. The file stays on this device from decode through export.
      </p>
    </button>
  );
}

function ModelCard({
  mode,
  progress,
  backend,
}: {
  mode: AiVideoMode;
  progress: AiRenderProgress | null;
  backend: 'webgpu' | 'wasm';
}) {
  const model = AI_VIDEO_MODELS[mode];
  const active = progress?.phase === 'model';
  const ready = progress && progress.phase !== 'model';

  return (
    <div className="rounded-xl border border-border bg-muted/45 p-4" role="status" aria-live="polite">
      <div className="flex items-start gap-3">
        <div className={cn('mt-0.5 rounded-lg p-2', active ? 'bg-primary/15 text-primary' : 'bg-secondary text-muted-foreground')}>
          {active ? <Loader2 className="h-4 w-4 animate-spin" /> : <Layers3 className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-foreground">{model.label}</p>
            <span className="font-mono text-[11px] text-muted-foreground">{formatSize(model.bytes)}</span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {ready
              ? `${backend === 'webgpu' ? 'GPU' : 'CPU'} engine ready on this device`
              : active
                ? modelProgressText(progress)
                : 'Downloads once, then stays cached in this browser'}
          </p>
          {active && (
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-background/70">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-200"
                style={{ width: `${Math.max(3, (progress?.model?.fraction ?? 0) * 100)}%` }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function VideoEnhancerTool() {
  const [file, setFile] = useState<File | null>(null);
  const [info, setInfo] = useState<VideoInfo | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [mode, setMode] = useState<AiVideoMode>('fps');
  const [fpsMultiplier, setFpsMultiplier] = useState<2 | 4>(2);
  const [motionDetail, setMotionDetail] = useState<MotionDetail>('balanced');
  const [sceneCutProtection, setSceneCutProtection] = useState(true);
  const [status, setStatus] = useState<LoadStatus>('idle');
  const [progress, setProgress] = useState<AiRenderProgress | null>(null);
  const [result, setResult] = useState<AiVideoRenderResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const preferredBackend = getPreferredAiBackend();
  const backend = progress?.backend ?? result?.backend ?? preferredBackend;
  const browserReady = supportsAiVideoRendering();

  useEffect(() => () => {
    abortRef.current?.abort();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const output = useMemo(() => {
    if (!info) return null;
    return mode === 'fps'
      ? {
          primary: `${formatFps(info.fps)} → ${formatFps(info.fps * fpsMultiplier)} FPS`,
          secondary: `${info.width} × ${info.height}`,
        }
      : {
          primary: `${info.width} × ${info.height} → ${info.width * 2} × ${info.height * 2}`,
          secondary: info.width >= 1900 && info.height >= 1000 ? '4K delivery' : '2× delivery',
        };
  }, [fpsMultiplier, info, mode]);

  const loadFile = async (nextFile: File) => {
    abortRef.current?.abort();
    setStatus('inspecting');
    setError(null);
    setResult(null);
    setProgress(null);
    setInfo(null);
    setFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);

    try {
      const metadata = await inspectVideo(nextFile);
      const nextUrl = URL.createObjectURL(nextFile);
      setFile(nextFile);
      setInfo(metadata);
      setPreviewUrl(nextUrl);
      setStatus('ready');
    } catch (caught) {
      setStatus('error');
      setError(caught instanceof Error ? caught.message : 'This video could not be opened.');
    }
  };

  const clearFile = () => {
    abortRef.current?.abort();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setFile(null);
    setInfo(null);
    setProgress(null);
    setResult(null);
    setError(null);
    setStatus('idle');
  };

  const startRender = async () => {
    if (!file || !info || status === 'rendering') return;
    setError(null);
    setResult(null);

    const outputName = getAiVideoName(file.name, mode, fpsMultiplier);
    let saveHandle = null;
    if (supportsDirectFileSave()) {
      try {
        saveHandle = await requestAiVideoSaveHandle(outputName);
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        setError(caught instanceof Error ? caught.message : 'The save location could not be opened.');
        return;
      }
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setStatus('rendering');
    setProgress({ phase: 'model', fraction: 0, label: 'Checking cached model' });

    try {
      const rendered = await renderAiVideo(file, info, {
        mode,
        fpsMultiplier,
        motionDetail,
        sceneCutProtection,
        upscaleFactor: 2,
        saveHandle,
        signal: controller.signal,
        onProgress: setProgress,
      });
      setResult(rendered);
      setStatus('done');
    } catch (caught) {
      if (controller.signal.aborted || (caught instanceof DOMException && caught.name === 'AbortError')) {
        setStatus('ready');
        setProgress(null);
      } else {
        setStatus('error');
        setError(caught instanceof Error ? caught.message : 'The AI render failed.');
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const cancelRender = () => abortRef.current?.abort();

  if (!file || !info || !previewUrl) {
    return (
      <section className="mx-auto max-w-6xl pb-16 pt-5">
        <div className="mx-auto mb-10 max-w-3xl text-center">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/[0.07] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
            <Sparkles className="h-3.5 w-3.5" /> AI video lab
          </div>
          <h2 className="font-display text-4xl font-semibold tracking-[-0.03em] text-foreground sm:text-5xl">
            Better motion. Real detail.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Generate true in-between frames with RIFE or rebuild soft AI footage with native 2× super-resolution—locally, without creating a project or uploading your footage.
          </p>
        </div>

        <VideoDropzone onFile={(next) => void loadFile(next)} busy={status === 'inspecting'} />
        {error && <div role="alert" className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-red-200">{error}</div>}

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card/65 p-5">
            <div className="flex items-start gap-4">
              <div className="rounded-xl bg-primary/10 p-3 text-primary"><Gauge className="h-5 w-5" /></div>
              <div>
                <p className="font-display text-lg font-semibold">FPS Boost</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">RIFE studies motion between frames and creates new frames—2× or 4× FPS, not simple blending.</p>
                <p className="mt-3 font-mono text-[11px] text-muted-foreground">RIFE v4.9 · {formatSize(AI_VIDEO_MODELS.fps.bytes)}</p>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-card/65 p-5">
            <div className="flex items-start gap-4">
              <div className="rounded-xl bg-primary/10 p-3 text-primary"><MonitorUp className="h-5 w-5" /></div>
              <div>
                <p className="font-display text-lg font-semibold">AI Upscale</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">AMD SESR reconstructs texture and edges frame by frame at native 2× scale for stable 1080p-to-4K work.</p>
                <p className="mt-3 font-mono text-[11px] text-muted-foreground">AMD SESR x2 · {formatSize(AI_VIDEO_MODELS.upscale.bytes)}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-emerald-400" /> Media never leaves your device</span>
          <span className="flex items-center gap-1.5">{preferredBackend === 'webgpu' ? <Zap className="h-4 w-4 text-primary" /> : <Cpu className="h-4 w-4" />} {preferredBackend === 'webgpu' ? 'WebGPU detected' : 'CPU fallback available'}</span>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-[1480px] pb-14">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">AI video lab</p>
          <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight">Enhance video</h2>
          <p className="mt-1 text-sm text-muted-foreground">Choose the transformation, then let the local render run.</p>
        </div>
        <button type="button" disabled={status === 'rendering'} onClick={clearFile} className="flex items-center gap-2 self-start rounded-lg px-3 py-2 text-sm text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-40">
          <X className="h-4 w-4" /> Choose another video
        </button>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className="space-y-5">
          <div className="overflow-hidden rounded-2xl border border-border bg-[hsl(var(--canvas))] shadow-2xl shadow-black/20">
            <div className="flex items-center justify-between border-b border-border bg-card/80 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{file.name}</p>
                <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{info.width}×{info.height} · {formatFps(info.fps)} FPS · {formatDuration(info.duration)} · {formatSize(file.size)}</p>
              </div>
              <Film className="ml-3 h-4 w-4 shrink-0 text-muted-foreground" />
            </div>
            <div className="flex min-h-[390px] items-center justify-center bg-black/45 p-3">
              <video src={previewUrl} controls playsInline className="max-h-[68vh] w-full rounded-lg object-contain" />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Source</p>
              <p className="mt-2 font-mono text-sm">{info.width} × {info.height}</p>
            </div>
            <div className="rounded-xl border border-primary/20 bg-primary/[0.06] p-4">
              <p className="text-[11px] uppercase tracking-wider text-primary">Output</p>
              <p className="mt-2 font-mono text-sm text-foreground">{output?.primary}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Engine</p>
              <p className="mt-2 flex items-center gap-2 text-sm">{backend === 'webgpu' ? <Zap className="h-4 w-4 text-primary" /> : <Cpu className="h-4 w-4 text-muted-foreground" />}{backend === 'webgpu' ? 'WebGPU' : 'CPU fallback'}</p>
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-xl shadow-black/10">
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted p-1">
              <button
                type="button"
                disabled={status === 'rendering'}
                onClick={() => { setMode('fps'); setProgress(null); setResult(null); setError(null); }}
                className={cn('flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition', mode === 'fps' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
              >
                <Gauge className="h-4 w-4" /> FPS Boost
              </button>
              <button
                type="button"
                disabled={status === 'rendering'}
                onClick={() => { setMode('upscale'); setProgress(null); setResult(null); setError(null); }}
                className={cn('flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition', mode === 'upscale' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
              >
                <Wand2 className="h-4 w-4" /> AI Upscale
              </button>
            </div>

            {mode === 'fps' ? (
              <div className="mt-5 space-y-5">
                <div>
                  <div className="mb-2 flex items-center justify-between"><label className="text-xs font-semibold">Frame multiplier</label><span className="font-mono text-xs text-primary">{formatFps(info.fps * fpsMultiplier)} FPS</span></div>
                  <div className="grid grid-cols-2 gap-2">
                    {([2, 4] as const).map((factor) => (
                      <button key={factor} type="button" disabled={status === 'rendering'} onClick={() => setFpsMultiplier(factor)} className={cn('rounded-lg border px-3 py-2.5 text-sm font-semibold transition', fpsMultiplier === factor ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-secondary')}>{factor}× frames</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold">Motion detail</label>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {(['balanced', 'full'] as const).map((detail) => (
                      <button key={detail} type="button" disabled={status === 'rendering'} onClick={() => setMotionDetail(detail)} className={cn('rounded-lg border px-3 py-2.5 text-sm capitalize transition', motionDetail === detail ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-secondary')}>{detail}</button>
                    ))}
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Balanced analyzes motion at up to 1280px. Full keeps every source pixel and takes longer.</p>
                </div>
                <button type="button" disabled={status === 'rendering'} onClick={() => setSceneCutProtection((value) => !value)} className="flex w-full items-center justify-between rounded-xl border border-border bg-muted/40 p-3 text-left">
                  <span><span className="block text-sm font-medium">Scene-cut protection</span><span className="mt-0.5 block text-xs text-muted-foreground">Prevents melted frames across edits</span></span>
                  <span className={cn('relative h-6 w-11 rounded-full transition', sceneCutProtection ? 'bg-primary' : 'bg-secondary')}><span className={cn('absolute top-1 h-4 w-4 rounded-full bg-white transition', sceneCutProtection ? 'left-6' : 'left-1')} /></span>
                </button>
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                <div className="rounded-xl border border-primary/20 bg-primary/[0.06] p-4">
                  <div className="flex items-center gap-3"><ScanLine className="h-5 w-5 text-primary" /><div><p className="text-sm font-semibold">2× learned reconstruction</p><p className="mt-1 font-mono text-xs text-muted-foreground">{info.width * 2} × {info.height * 2}</p></div></div>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">A learned super-resolution network reconstructs every frame directly at 2×. This is genuine model inference, not a CSS or Lanczos resize.</p>
              </div>
            )}
          </div>

          <ModelCard mode={mode} progress={progress} backend={backend} />

          {!browserReady && (
            <div role="alert" className="rounded-xl border border-amber-300/25 bg-amber-300/10 p-4 text-sm leading-relaxed text-amber-100">Local video encoding is unavailable here. Open the app in a current Chrome or Edge browser.</div>
          )}
          {error && (
            <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm leading-relaxed text-red-200">{error}</div>
          )}
          {result && (
            <div role="status" className="rounded-xl border border-emerald-400/25 bg-emerald-400/10 p-4 text-sm text-emerald-100">
              <p className="flex items-center gap-2 font-semibold"><Check className="h-4 w-4" /> Render complete</p>
              <p className="mt-1 break-all text-xs text-emerald-200/75">{result.outputName} · {formatSize(result.outputBytes)}</p>
            </div>
          )}

          {status === 'rendering' && progress ? (
            <div className="rounded-2xl border border-primary/25 bg-primary/[0.07] p-5" aria-live="polite" aria-busy="true">
              <div className="flex items-start gap-3">
                <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-primary" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold">{progress.label}</p><span className="font-mono text-xs text-primary">{Math.round(progress.fraction * 100)}%</span></div>
                  <p className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">{progress.phase}</p>
                </div>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-background/70"><div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${Math.max(2, progress.fraction * 100)}%` }} /></div>
              <button type="button" onClick={cancelRender} className="mt-4 w-full rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground transition hover:bg-secondary hover:text-foreground">Cancel render</button>
            </div>
          ) : (
            <button
              type="button"
              disabled={!browserReady}
              onClick={() => void startRender()}
              className="group flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 font-semibold text-primary-foreground shadow-[0_16px_50px_hsl(var(--primary)/.16)] transition hover:-translate-y-0.5 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {supportsDirectFileSave() ? <HardDriveDownload className="h-4 w-4" /> : <Download className="h-4 w-4" />}
              {mode === 'fps' ? `Render ${fpsMultiplier}× FPS` : `Render ${output?.secondary}`}
            </button>
          )}

          <div className="rounded-xl border border-border bg-card px-4 py-3">
            <p className="flex items-center gap-2 text-xs text-muted-foreground"><Clapperboard className="h-4 w-4 text-primary" /> AI renders can take minutes. Keep this tab open.</p>
          </div>
          <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" /> Models may download; your media does not upload</p>
        </aside>
      </div>
    </section>
  );
}
