import { useEffect, useMemo, useState } from 'react';
import { FileType, Download, X, Loader2, Trash2 } from 'lucide-react';
import { useBatchQueue, type ProcessOne } from '../../hooks/useBatchQueue';
import { BatchDropzone, BatchGrid } from '../Batch';
import { InfoTip } from '../Tooltip';
import {
  convertImage,
  getSupportedOutputFormats,
  CONVERT_ACCEPT,
  type OutputFormat,
} from '../../lib/convert';

interface ConversionSettings {
  format: OutputFormat;
  quality: number;
  matte: string;
}

const processOne: ProcessOne<ConversionSettings> = (file, settings) => convertImage(file, settings);

export function ConversionTool() {
  const q = useBatchQueue<ConversionSettings>(processOne);
  const [formats, setFormats] = useState<OutputFormat[]>([]);
  const [formatMime, setFormatMime] = useState('image/webp');
  const [quality, setQuality] = useState(0.9);
  const [matte, setMatte] = useState('#ffffff');

  // Detect which formats the browser can actually encode, then default sensibly.
  useEffect(() => {
    getSupportedOutputFormats().then((fmts) => {
      setFormats(fmts);
      setFormatMime((cur) => (fmts.some((f) => f.mime === cur) ? cur : fmts[0]?.mime ?? 'image/png'));
    });
  }, []);

  const format = useMemo(
    () => formats.find((f) => f.mime === formatMime) ?? formats[0],
    [formats, formatMime],
  );

  if (q.items.length === 0) {
    return (
      <div className="max-w-2xl mx-auto mt-10">
        <div className="text-center mb-10 space-y-4">
          <h2 className="text-4xl font-bold tracking-tight bg-gradient-to-br from-white to-white/60 bg-clip-text text-transparent">
            Bulk Image Converter
          </h2>
          <p className="text-muted-foreground text-lg">
            Convert any number of images at once. Reads PNG, JPG, WebP, AVIF, GIF, BMP, SVG, and
            iPhone HEIC. Download everything as a zip.
          </p>
        </div>
        <BatchDropzone onFiles={q.addFiles} accept={CONVERT_ACCEPT} />
      </div>
    );
  }

  return (
    <div className="grid lg:grid-cols-[300px_1fr] gap-6">
      <div className="space-y-5 p-5 bg-card rounded-xl border shadow-sm h-fit">
        <div className="space-y-1.5">
          <span className="text-xs font-medium flex items-center gap-1.5">
            Convert to{' '}
            <InfoTip text="Only formats your browser can actually produce are listed. WebP is best for the web; PNG keeps transparency; AVIF is smallest where supported." />
          </span>
          <select
            value={formatMime}
            onChange={(e) => setFormatMime(e.target.value)}
            className="w-full bg-secondary border-none rounded-lg px-3 py-2 text-sm"
          >
            {formats.map((f) => (
              <option key={f.mime} value={f.mime}>
                {f.label}
                {f.alpha ? '' : ' (no transparency)'}
              </option>
            ))}
          </select>
        </div>

        {format?.lossy && (
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-xs">
              <span className="font-medium">Quality</span>
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
        )}

        {format && !format.alpha && (
          <div className="space-y-1.5">
            <span className="text-xs font-medium flex items-center gap-1.5">
              Background{' '}
              <InfoTip text="JPEG can't be transparent. Transparent areas are filled with this color instead of turning black." />
            </span>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={matte}
                onChange={(e) => setMatte(e.target.value)}
                className="w-9 h-9 rounded-md border bg-transparent cursor-pointer"
              />
              <span className="text-xs text-muted-foreground font-mono">{matte}</span>
            </div>
          </div>
        )}

        {q.running ? (
          <button
            onClick={q.cancel}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-secondary rounded-lg font-medium hover:bg-secondary/80 transition-colors"
          >
            <X className="w-4 h-4" /> Cancel
          </button>
        ) : (
          <button
            onClick={() => format && q.run({ format, quality, matte })}
            disabled={!format}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            <FileType className="w-4 h-4" /> Convert {q.totals.total} image{q.totals.total === 1 ? '' : 's'}
          </button>
        )}

        <button
          onClick={() => q.downloadZip('converted_images.zip')}
          disabled={q.totals.done === 0}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-secondary rounded-lg font-medium hover:bg-secondary/80 transition-colors disabled:opacity-50"
        >
          <Download className="w-4 h-4" /> Download all ({q.totals.done})
        </button>

        <button
          onClick={q.clear}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <Trash2 className="w-4 h-4" /> Clear all
        </button>
      </div>

      <div className="space-y-4">
        <h3 className="font-medium flex items-center gap-2">
          {q.running && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
          {q.totals.done}/{q.totals.total} converted
          {q.totals.error > 0 && <span className="text-destructive text-sm">· {q.totals.error} failed</span>}
        </h3>
        <BatchDropzone onFiles={q.addFiles} compact label="Add more images" accept={CONVERT_ACCEPT} />
        <BatchGrid items={q.items} onRemove={q.removeItem} />
      </div>
    </div>
  );
}
