import { useCallback, useState } from 'react';
import { Upload, Download, X, CheckCircle2, AlertCircle, Loader2, Plus } from 'lucide-react';
import { cn } from '../lib/utils';
import type { BatchItem } from '../hooks/useBatchQueue';

export function formatSize(bytes: number): string {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function BatchDropzone({
  onFiles,
  compact = false,
  label = 'Drop images here or click to upload',
}: {
  onFiles: (files: FileList | File[]) => void;
  compact?: boolean;
  label?: string;
}) {
  const [dragging, setDragging] = useState(false);
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (e.dataTransfer.files?.length) onFiles(e.dataTransfer.files);
    },
    [onFiles],
  );
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setDragging(false);
      }}
      onDrop={handleDrop}
      className={cn(
        'relative group cursor-pointer rounded-xl border-2 border-dashed transition-all duration-300 flex flex-col items-center justify-center gap-3',
        compact ? 'h-28' : 'h-64',
        dragging ? 'border-primary bg-primary/5 scale-[1.01]' : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/40',
      )}
    >
      <input
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        className="absolute inset-0 opacity-0 cursor-pointer"
        onChange={(e) => e.target.files && onFiles(e.target.files)}
      />
      <div className={cn('p-3 rounded-full', dragging ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground group-hover:text-primary')}>
        {compact ? <Plus className="w-6 h-6" /> : <Upload className="w-7 h-7" />}
      </div>
      <div className="text-center">
        <p className="font-medium">{dragging ? 'Drop to add' : label}</p>
        {!compact && <p className="text-sm text-muted-foreground mt-1">Add as many as you like. PNG, JPG, WebP, HEIC.</p>}
      </div>
    </div>
  );
}

function StatusBadge({ item }: { item: BatchItem }) {
  if (item.status === 'processing')
    return <Loader2 className="w-4 h-4 text-primary animate-spin" />;
  if (item.status === 'done') return <CheckCircle2 className="w-4 h-4 text-green-500" />;
  if (item.status === 'error') return <AlertCircle className="w-4 h-4 text-destructive" />;
  return <span className="text-[10px] text-muted-foreground uppercase tracking-wide">queued</span>;
}

export function BatchGrid({
  items,
  onRemove,
  showSavings = false,
}: {
  items: BatchItem[];
  onRemove: (id: string) => void;
  showSavings?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {items.map((it) => {
        const savings =
          showSavings && it.resultSize ? Math.round((1 - it.resultSize / it.size) * 100) : null;
        return (
          <div key={it.id} className="group relative rounded-lg border bg-secondary/10 overflow-hidden">
            <div className="aspect-square relative">
              <div className="absolute inset-0 checkerboard opacity-40" />
              <img src={it.resultUrl || it.srcUrl} alt={it.name} className="absolute inset-0 w-full h-full object-contain p-2" />
              <button
                onClick={() => onRemove(it.id)}
                className="absolute top-1 right-1 p-1 rounded-md bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70"
                title="Remove"
              >
                <X className="w-3.5 h-3.5" />
              </button>
              {it.resultUrl && (
                <a
                  href={it.resultUrl}
                  download={it.resultName || it.name}
                  className="absolute bottom-1 right-1 p-1.5 rounded-md bg-primary text-primary-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Download"
                >
                  <Download className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
            <div className="p-2 space-y-0.5">
              <div className="flex items-center gap-1.5">
                <StatusBadge item={it} />
                <span className="text-xs truncate flex-1" title={it.name}>
                  {it.resultName || it.name}
                </span>
              </div>
              <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                {formatSize(it.size)}
                {it.resultSize != null && (
                  <>
                    <span>→</span>
                    <span className="text-foreground">{formatSize(it.resultSize)}</span>
                    {savings != null && (
                      <span className={savings >= 0 ? 'text-green-500' : 'text-amber-500'}>
                        ({savings >= 0 ? '-' : '+'}
                        {Math.abs(savings)}%)
                      </span>
                    )}
                  </>
                )}
              </div>
              {it.error && <p className="text-[11px] text-destructive truncate" title={it.error}>{it.error}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
