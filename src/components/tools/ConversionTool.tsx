import { useState } from 'react';
import { FileType, Download, X, Loader2, Trash2 } from 'lucide-react';
import heic2any from 'heic2any';
import { useBatchQueue, type ProcessOne } from '../../hooks/useBatchQueue';
import { BatchDropzone, BatchGrid } from '../Batch';
import { InfoTip } from '../Tooltip';

interface ConversionSettings {
  format: string; // image/webp | image/png | image/jpeg
  quality: number;
}

const processOne: ProcessOne<ConversionSettings> = async (file, settings) => {
  let source: Blob = file;

  // HEIC/HEIF needs decoding first (flaky, so it is isolated per item).
  if (file.type === 'image/heic' || file.type === 'image/heif' || /\.heic$/i.test(file.name)) {
    const res = await heic2any({ blob: file, toType: 'image/png' });
    source = Array.isArray(res) ? res[0] : res;
  }

  const bitmap = await createImageBitmap(source);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, settings.format, settings.quality),
  );
  if (!blob) throw new Error('Unsupported output format');

  const ext = settings.format.split('/')[1];
  const name = file.name.replace(/\.[^.]+$/, '') + '.' + ext;
  return { blob, name };
};

export function ConversionTool() {
  const q = useBatchQueue<ConversionSettings>(processOne);
  const [format, setFormat] = useState('image/webp');
  const [quality, setQuality] = useState(0.9);

  const lossy = format !== 'image/png';

  if (q.items.length === 0) {
    return (
      <div className="max-w-2xl mx-auto mt-10">
        <div className="text-center mb-10 space-y-4">
          <h2 className="text-4xl font-bold tracking-tight bg-gradient-to-br from-white to-white/60 bg-clip-text text-transparent">
            Bulk Image Converter
          </h2>
          <p className="text-muted-foreground text-lg">
            Convert any number of images to WebP, PNG, or JPEG at once. HEIC from iPhones is
            supported. Download everything as a zip.
          </p>
        </div>
        <BatchDropzone onFiles={q.addFiles} />
      </div>
    );
  }

  return (
    <div className="grid lg:grid-cols-[300px_1fr] gap-6">
      <div className="space-y-5 p-5 bg-card rounded-xl border shadow-sm h-fit">
        <div className="space-y-1.5">
          <span className="text-xs font-medium flex items-center gap-1.5">
            Convert to <InfoTip text="WebP gives the best size for the web. PNG keeps transparency and is lossless. JPEG is smallest for photos without transparency." />
          </span>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value)}
            className="w-full bg-secondary border-none rounded-lg px-3 py-2 text-sm"
          >
            <option value="image/webp">WebP</option>
            <option value="image/png">PNG</option>
            <option value="image/jpeg">JPEG</option>
          </select>
        </div>

        {lossy && (
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

        {q.running ? (
          <button
            onClick={q.cancel}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-secondary rounded-lg font-medium hover:bg-secondary/80 transition-colors"
          >
            <X className="w-4 h-4" /> Cancel
          </button>
        ) : (
          <button
            onClick={() => q.run({ format, quality })}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
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
        <BatchDropzone onFiles={q.addFiles} compact label="Add more images" />
        <BatchGrid items={q.items} onRemove={q.removeItem} />
      </div>
    </div>
  );
}
