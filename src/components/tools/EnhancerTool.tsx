import { useCallback, useEffect, useRef, useState } from 'react';
import { Wand2, Download, RotateCcw, ImageUp, Sparkles, Zap } from 'lucide-react';
import { ImageUploader } from '../ImageUploader';
import { InfoTip } from '../Tooltip';
import { resampleImage, loadImageFromFile, type OutputFormat } from '../../lib/enhance/resample';
import { aiUpscale, AI_MAX_INPUT_PIXELS } from '../../lib/enhance/aiUpscale';

const SCALES = [2, 3, 4];
type Method = 'lanczos' | 'ai';

export function EnhancerTool() {
  const [original, setOriginal] = useState<HTMLImageElement | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string>('');
  const [resultUrl, setResultUrl] = useState<string>('');
  const [scale, setScale] = useState(2);
  const [sharpen, setSharpen] = useState(0.6);
  const [format, setFormat] = useState<OutputFormat>('image/png');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState<Method>('lanczos');
  const [aiProgress, setAiProgress] = useState<{ p: number; label: string } | null>(null);
  const resultUrlRef = useRef('');

  useEffect(() => {
    resultUrlRef.current = resultUrl;
  }, [resultUrl]);
  useEffect(() => {
    return () => {
      if (originalUrl) URL.revokeObjectURL(originalUrl);
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    };
  }, [originalUrl]);

  const handleSelect = useCallback(async (file: File) => {
    setError(null);
    try {
      const img = await loadImageFromFile(file);
      setOriginal(img);
      setOriginalUrl(img.src);
    } catch {
      setError('Could not load that image.');
    }
  }, []);

  const targetW = original ? original.naturalWidth * scale : 0;
  const targetH = original ? original.naturalHeight * scale : 0;
  const tooBig = targetW > 16384 || targetH > 16384;

  const enhance = useCallback(async () => {
    if (!original) return;
    if (method === 'lanczos' && tooBig) return;
    setProcessing(true);
    setError(null);
    try {
      let blob: Blob;
      if (method === 'ai') {
        if (original.naturalWidth * original.naturalHeight > AI_MAX_INPUT_PIXELS) {
          throw new Error('Image is too large for AI mode (about 1600x1600 max). Use High quality, or shrink it first.');
        }
        const canvas = await aiUpscale(original, (p, label) => setAiProgress({ p, label }));
        const b = await new Promise<Blob | null>((res) => canvas.toBlob(res, format, 0.95));
        if (!b) throw new Error('Could not export the result.');
        blob = b;
      } else {
        blob = await resampleImage(original, { targetWidth: targetW, targetHeight: targetH, sharpen, format });
      }
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
      setResultUrl(URL.createObjectURL(blob));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enhancement failed.');
    } finally {
      setProcessing(false);
      setAiProgress(null);
    }
  }, [original, method, targetW, targetH, sharpen, format, tooBig]);

  if (!original) {
    return (
      <div className="max-w-2xl mx-auto mt-10">
        <div className="text-center mb-10 space-y-4">
          <div className="flex items-center justify-center gap-3 mb-2">
            <Wand2 className="w-9 h-9 text-primary" />
            <h2 className="text-4xl font-bold tracking-tight">Upscale &amp; Sharpen</h2>
          </div>
          <p className="text-muted-foreground text-lg">
            Enlarge images with high-quality Lanczos resampling and crisp sharpening. Fast,
            reliable, and fully in your browser.
          </p>
        </div>
        <ImageUploader onImageSelect={handleSelect} />
      </div>
    );
  }

  const ext = format.split('/')[1];

  return (
    <div className="grid lg:grid-cols-[320px_1fr] gap-6">
      <div className="space-y-5 p-5 bg-card rounded-xl border shadow-sm h-fit">
        {/* Method */}
        <div className="space-y-2">
          <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            Method <InfoTip text="High quality is instant and great for most jobs. AI redraws detail and is best for small or low-res images, but is slower and downloads a model the first time." />
          </span>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setMethod('lanczos')}
              className={`flex items-center justify-center gap-1.5 py-2.5 text-sm rounded-lg border transition-colors ${
                method === 'lanczos' ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-secondary'
              }`}
            >
              <Zap className="w-4 h-4" /> High quality
            </button>
            <button
              onClick={() => setMethod('ai')}
              className={`flex items-center justify-center gap-1.5 py-2.5 text-sm rounded-lg border transition-colors ${
                method === 'ai' ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-secondary'
              }`}
            >
              <Sparkles className="w-4 h-4" /> AI
            </button>
          </div>
        </div>

        {method === 'lanczos' ? (
          <>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Scale factor</label>
              <div className="grid grid-cols-3 gap-2">
                {SCALES.map((s) => (
                  <button
                    key={s}
                    onClick={() => setScale(s)}
                    className={`py-2 text-sm rounded-lg border transition-colors ${
                      scale === s ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-secondary'
                    }`}
                  >
                    {s}x
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {original.naturalWidth}×{original.naturalHeight} → {targetW}×{targetH}
              </p>
              {tooBig && <p className="text-xs text-destructive">Result exceeds 16384px. Pick a smaller scale.</p>}
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="font-medium">Sharpening</span>
                <span className="text-muted-foreground font-mono">{Math.round(sharpen * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={2}
                step={0.05}
                value={sharpen}
                onChange={(e) => setSharpen(Number(e.target.value))}
                className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
              />
            </div>
          </>
        ) : (
          <div className="p-3 rounded-lg border bg-secondary/20 text-xs text-muted-foreground leading-snug">
            AI upscales 4x: {original.naturalWidth}×{original.naturalHeight} → {original.naturalWidth * 4}×
            {original.naturalHeight * 4}. Best on smaller images. The first run downloads a ~5MB model.
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Output format</label>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as OutputFormat)}
            className="w-full bg-secondary border-none rounded-lg px-3 py-2 text-sm"
          >
            <option value="image/png">PNG (lossless)</option>
            <option value="image/webp">WebP</option>
            <option value="image/jpeg">JPEG</option>
          </select>
        </div>

        <button
          onClick={enhance}
          disabled={processing || (method === 'lanczos' && tooBig)}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {processing ? (
            <>
              <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
              {aiProgress?.label ?? 'Processing…'}
            </>
          ) : (
            <>
              <ImageUp className="w-4 h-4" /> Enhance
            </>
          )}
        </button>

        {resultUrl && (
          <a
            href={resultUrl}
            download={`enhanced_${method === 'ai' ? '4x_ai' : scale + 'x'}.${ext}`}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-secondary rounded-lg font-medium hover:bg-secondary/80 transition-colors"
          >
            <Download className="w-4 h-4" /> Download
          </a>
        )}

        <button
          onClick={() => {
            setOriginal(null);
            setResultUrl('');
          }}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <RotateCcw className="w-4 h-4" /> Start over
        </button>

        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <h3 className="font-medium text-sm text-center">Original</h3>
          <div className="relative flex-1 min-h-[320px] bg-secondary/20 rounded-xl border overflow-hidden">
            <div className="absolute inset-0 checkerboard opacity-50" />
            <div className="absolute inset-0 flex items-center justify-center p-4">
              <img src={originalUrl} alt="Original" className="max-w-full max-h-full object-contain" />
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="font-medium text-sm text-center">Enhanced</h3>
          <div className="relative flex-1 min-h-[320px] bg-secondary/20 rounded-xl border overflow-hidden flex items-center justify-center">
            <div className="absolute inset-0 checkerboard opacity-50" />
            {processing ? (
              <div className="relative flex flex-col items-center gap-3 w-48">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                {aiProgress && (
                  <>
                    <span className="text-xs text-muted-foreground text-center">{aiProgress.label}</span>
                    <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full bg-primary transition-all" style={{ width: `${Math.round(aiProgress.p * 100)}%` }} />
                    </div>
                  </>
                )}
              </div>
            ) : resultUrl ? (
              <div className="absolute inset-0 flex items-center justify-center p-4">
                <img src={resultUrl} alt="Enhanced" className="max-w-full max-h-full object-contain" />
              </div>
            ) : (
              <span className="relative text-sm text-muted-foreground">Enhanced image appears here</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
