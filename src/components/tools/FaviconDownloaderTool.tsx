import { useMemo, useState } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { Download, Globe2, ImageDown, Loader2, PackageOpen, Search, ShieldCheck } from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  discoverSiteIcons,
  downloadPublicAsset,
  inspectSite,
  type IconCandidate,
  type SiteMetadata,
} from '../../lib/siteInspector';

type Status = 'idle' | 'scanning' | 'downloading';

function iconFileName(icon: IconCandidate, index: number) {
  const pathname = new URL(icon.url).pathname;
  const raw = pathname.split('/').filter(Boolean).pop() || `favicon-${index + 1}.png`;
  const clean = raw.replace(/[^a-z0-9._-]+/gi, '-');
  return /\.[a-z0-9]{2,5}$/i.test(clean) ? clean : `${clean || `favicon-${index + 1}`}.png`;
}

function saveBlob(blob: Blob, name: string) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
}

export function FaviconDownloaderTool() {
  const [url, setUrl] = useState('');
  const [metadata, setMetadata] = useState<SiteMetadata | null>(null);
  const [icons, setIcons] = useState<IconCandidate[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [broken, setBroken] = useState<Set<number>>(new Set());
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState('');

  const usableSelected = useMemo(
    () => [...selected].filter((index) => !broken.has(index)),
    [broken, selected],
  );

  const scan = async () => {
    setStatus('scanning');
    setError(null);
    setMetadata(null);
    setIcons([]);
    setBroken(new Set());
    try {
      const nextMetadata = await inspectSite(url);
      const nextIcons = await discoverSiteIcons(nextMetadata);
      setMetadata(nextMetadata);
      setIcons(nextIcons);
      setSelected(new Set(nextIcons.map((_, index) => index)));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Could not inspect that website.');
    } finally {
      setStatus('idle');
    }
  };

  const downloadOne = async (icon: IconCandidate, index: number) => {
    setError(null);
    try {
      saveBlob(await downloadPublicAsset(icon.url), iconFileName(icon, index));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Could not download that icon.');
    }
  };

  const downloadSelected = async () => {
    if (!metadata || !usableSelected.length) return;
    setStatus('downloading');
    setError(null);
    const zip = new JSZip();
    let downloaded = 0;
    try {
      for (const index of usableSelected) {
        setProgress(`Fetching ${downloaded + 1} of ${usableSelected.length}…`);
        try {
          zip.file(`${String(index + 1).padStart(2, '0')}-${iconFileName(icons[index], index)}`, await downloadPublicAsset(icons[index].url));
          downloaded++;
        } catch {
          // Skip dead declarations while preserving the rest of the set.
        }
      }
      if (!downloaded) throw new Error('None of the selected favicon files could be downloaded.');
      zip.file('sources.txt', usableSelected.map((index) => icons[index].url).join('\n'));
      const host = new URL(metadata.url).hostname.replace(/^www\./, '');
      saveAs(await zip.generateAsync({ type: 'blob' }), `${host}-favicons.zip`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Could not build the favicon download.');
    } finally {
      setProgress('');
      setStatus('idle');
    }
  };

  return (
    <section className="mx-auto max-w-6xl" aria-labelledby="favicon-downloader-title">
      <div className="mx-auto mb-8 max-w-3xl text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
          <ImageDown className="h-3.5 w-3.5" /> Website asset inspector
        </div>
        <h2 id="favicon-downloader-title" className="text-4xl font-bold tracking-[-0.04em] text-white sm:text-5xl">Pull every favicon from a site.</h2>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
          Find declared icons, manifest assets, Apple touch icons, and reliable fallbacks—then download one file or the whole set.
        </p>
      </div>

      <form
        onSubmit={(event) => { event.preventDefault(); void scan(); }}
        className="mx-auto flex max-w-3xl flex-col gap-3 rounded-2xl border border-border bg-card p-3 shadow-2xl shadow-black/20 sm:flex-row"
      >
        <label className="flex min-w-0 flex-1 items-center gap-3 rounded-xl bg-canvas px-4 focus-within:ring-2 focus-within:ring-primary/30">
          <Globe2 className="h-4 w-4 shrink-0 text-primary" />
          <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="example.com" className="min-w-0 flex-1 bg-transparent py-3 text-sm text-foreground outline-none" />
        </label>
        <button disabled={status !== 'idle' || !url.trim()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-40">
          {status === 'scanning' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Scan site
        </button>
      </form>

      {error && <div role="alert" className="mx-auto mt-4 max-w-3xl rounded-xl border border-red-400/25 bg-red-400/10 px-4 py-3 text-sm text-red-200">{error}</div>}

      {metadata && (
        <div className="mt-7">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-white">{new URL(metadata.url).hostname}</p>
              <p className="text-xs text-muted-foreground">Found {icons.length} candidates · {metadata.route === 'relay' ? 'read through browser-safe relay' : 'read directly'}</p>
            </div>
            <button onClick={() => void downloadSelected()} disabled={!usableSelected.length || status !== 'idle'} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-40">
              {status === 'downloading' ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageOpen className="h-4 w-4" />}
              {progress || `Download selected (${usableSelected.length})`}
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {icons.map((icon, index) => {
              const unavailable = broken.has(index);
              const checked = selected.has(index) && !unavailable;
              return (
                <article key={icon.url} className={cn('group rounded-2xl border bg-card p-4 transition', checked ? 'border-primary/35' : 'border-border', unavailable && 'opacity-45')}>
                  <div className="flex items-start gap-4">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-[linear-gradient(45deg,#181d25_25%,transparent_25%),linear-gradient(-45deg,#181d25_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#181d25_75%),linear-gradient(-45deg,transparent_75%,#181d25_75%)] bg-[length:12px_12px] bg-[position:0_0,0_6px,6px_-6px,-6px_0px]">
                      <img src={icon.url} alt="" className="max-h-12 max-w-12 object-contain" onError={() => setBroken((current) => new Set(current).add(index))} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-foreground" title={iconFileName(icon, index)}>{iconFileName(icon, index)}</p>
                        <input type="checkbox" checked={checked} disabled={unavailable} aria-label={`Select ${iconFileName(icon, index)}`} onChange={() => setSelected((current) => { const next = new Set(current); if (next.has(index)) next.delete(index); else next.add(index); return next; })} className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]" />
                      </div>
                      <p className="mt-1 truncate text-[11px] text-muted-foreground">{icon.sizes || 'size not declared'} · {icon.source}</p>
                      <button onClick={() => void downloadOne(icon, index)} disabled={unavailable} className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-primary disabled:opacity-40"><Download className="h-3.5 w-3.5" /> Download</button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          <p className="mt-5 flex items-center justify-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" /> Public page data only; no login or private browser data is accessed.</p>
        </div>
      )}
    </section>
  );
}
