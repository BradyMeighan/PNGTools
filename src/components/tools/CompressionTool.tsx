import { useMemo, useState } from 'react';
import imageCompression from 'browser-image-compression';
import { Download, Minimize2, X, Loader2, Trash2 } from 'lucide-react';
import { useBatchQueue, type ProcessOne } from '../../hooks/useBatchQueue';
import { BatchDropzone, BatchGrid, formatSize } from '../Batch';
import { Tooltip, InfoTip } from '../Tooltip';

interface CompressionSettings {
  quality: number;
  maxDimension: number; // 0 = keep original size
}

const processOne: ProcessOne<CompressionSettings> = async (file, settings, signal) => {
  const out = await imageCompression(file, {
    maxSizeMB: 50,
    maxWidthOrHeight: settings.maxDimension > 0 ? settings.maxDimension : undefined,
    initialQuality: settings.quality,
    useWebWorker: true,
    signal,
  });
  return out;
};

export function CompressionTool() {
  const q = useBatchQueue<CompressionSettings>(processOne);
  const [quality, setQuality] = useState(0.7);
  const [maxDimension, setMaxDimension] = useState(0);

  const { originalTotal, compressedTotal } = useMemo(() => {
    let o = 0;
    let c = 0;
    for (const it of q.items) {
      o += it.size;
      if (it.resultSize != null) c += it.resultSize;
      else c += it.size;
    }
    return { originalTotal: o, compressedTotal: c };
  }, [q.items]);

  const savings = originalTotal ? Math.round((1 - compressedTotal / originalTotal) * 100) : 0;

  if (q.items.length === 0) {
    return (
      <div className="max-w-2xl mx-auto mt-10">
        <div className="text-center mb-10 space-y-4">
          <h2 className="text-4xl font-bold tracking-tight bg-gradient-to-br from-white to-white/60 bg-clip-text text-transparent">
            Bulk Image Compression
          </h2>
          <p className="text-muted-foreground text-lg">
            Drop in as many images as you want and shrink them all at once. Compare sizes and
            download everything as a zip.
          </p>
        </div>
        <BatchDropzone onFiles={q.addFiles} />
      </div>
    );
  }

  return (
    <div className="grid lg:grid-cols-[300px_1fr] gap-6">
      {/* Controls */}
      <div className="space-y-5 p-5 bg-card rounded-xl border shadow-sm h-fit">
        <div className="space-y-1.5">
          <div className="flex justify-between items-center text-xs">
            <span className="font-medium flex items-center gap-1.5">
              Quality <InfoTip text="Lower means smaller files but more visible quality loss. 70% is a good default for the web." />
            </span>
            <span className="text-muted-foreground font-mono">{Math.round(quality * 100)}%</span>
          </div>
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.01}
            value={quality}
            onChange={(e) => setQuality(parseFloat(e.target.value))}
            className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
          />
        </div>

        <div className="space-y-1.5">
          <span className="text-xs font-medium flex items-center gap-1.5">
            Max dimension <InfoTip text="Optionally shrink large images so the longest side is at most this many pixels. Great for huge phone photos." />
          </span>
          <select
            value={maxDimension}
            onChange={(e) => setMaxDimension(Number(e.target.value))}
            className="w-full bg-secondary border-none rounded-lg px-3 py-2 text-sm"
          >
            <option value={0}>Keep original size</option>
            <option value={2560}>Max 2560px</option>
            <option value={1920}>Max 1920px</option>
            <option value={1280}>Max 1280px</option>
            <option value={800}>Max 800px</option>
          </select>
        </div>

        <div className="p-4 bg-secondary/20 rounded-lg space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Original</span>
            <span className="font-medium">{formatSize(originalTotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">After</span>
            <span className="font-medium text-primary">{formatSize(compressedTotal)}</span>
          </div>
          <div className="pt-2 border-t border-border/50 flex justify-between items-center">
            <span className="font-medium">Saved</span>
            <span className="font-bold text-green-500">{savings}%</span>
          </div>
        </div>

        {q.running ? (
          <button
            onClick={q.cancel}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-secondary rounded-lg font-medium hover:bg-secondary/80 transition-colors"
          >
            <X className="w-4 h-4" /> Cancel
          </button>
        ) : (
          <button
            onClick={() => q.run({ quality, maxDimension })}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
          >
            <Minimize2 className="w-4 h-4" /> Compress {q.totals.total} image{q.totals.total === 1 ? '' : 's'}
          </button>
        )}

        <Tooltip text="Download every compressed image (zipped when there's more than one).">
          <button
            onClick={() => q.downloadZip('compressed_images.zip')}
            disabled={q.totals.done === 0}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-secondary rounded-lg font-medium hover:bg-secondary/80 transition-colors disabled:opacity-50"
          >
            <Download className="w-4 h-4" /> Download all ({q.totals.done})
          </button>
        </Tooltip>

        <button
          onClick={q.clear}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <Trash2 className="w-4 h-4" /> Clear all
        </button>
      </div>

      {/* Items */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-medium flex items-center gap-2">
            {q.running && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
            {q.totals.done}/{q.totals.total} done
            {q.totals.error > 0 && <span className="text-destructive text-sm">· {q.totals.error} failed</span>}
          </h3>
        </div>
        <BatchDropzone onFiles={q.addFiles} compact label="Add more images" />
        <BatchGrid items={q.items} onRemove={q.removeItem} showSavings />
      </div>
    </div>
  );
}
