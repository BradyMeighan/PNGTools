import { useMemo, useState } from 'react';
import { Check, Code2, Eye, Globe2, ImageOff, Loader2, Search, TriangleAlert, X } from 'lucide-react';
import { analyzeSiteHtml, inspectSite, type SiteMetadata } from '../../lib/siteInspector';

interface CheckItem { label: string; ok: boolean; detail: string }

function buildChecks(meta: SiteMetadata): CheckItem[] {
  return [
    { label: 'Page title', ok: meta.title.length >= 10 && meta.title.length <= 60, detail: meta.title ? `${meta.title.length} characters (aim for 10–60)` : 'Missing' },
    { label: 'Meta description', ok: meta.description.length >= 50 && meta.description.length <= 160, detail: meta.description ? `${meta.description.length} characters (aim for 50–160)` : 'Missing' },
    { label: 'Canonical URL', ok: Boolean(meta.canonical), detail: meta.canonical || 'Missing' },
    { label: 'Mobile viewport', ok: /width\s*=\s*device-width/i.test(meta.viewport), detail: meta.viewport || 'Missing' },
    { label: 'Character encoding', ok: Boolean(meta.charset), detail: meta.charset || 'Missing' },
    { label: 'Open Graph core', ok: Boolean(meta.og.title && meta.og.description && meta.og.image), detail: 'og:title, og:description, and og:image' },
    { label: 'X / Twitter card', ok: Boolean(meta.twitter.card && (meta.twitter.title || meta.og.title)), detail: meta.twitter.card || 'Missing twitter:card' },
    { label: 'Search indexing', ok: !/noindex/i.test(meta.robots), detail: meta.robots || 'No restrictive robots tag' },
  ];
}

function PreviewImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <div className="flex h-full items-center justify-center bg-secondary/40 text-muted-foreground"><ImageOff className="h-7 w-7" /></div>;
  return <img src={src} alt={alt} className="h-full w-full object-cover" onError={() => setFailed(true)} />;
}

export function MetaTagCheckerTool() {
  const [url, setUrl] = useState('');
  const [html, setHtml] = useState('');
  const [pasteMode, setPasteMode] = useState(false);
  const [metadata, setMetadata] = useState<SiteMetadata | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checks = useMemo(() => metadata ? buildChecks(metadata) : [], [metadata]);
  const score = checks.length ? Math.round((checks.filter((check) => check.ok).length / checks.length) * 100) : 0;

  const analyze = async () => {
    setLoading(true);
    setError(null);
    try {
      setMetadata(pasteMode ? analyzeSiteHtml(html, url) : await inspectSite(url));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Could not inspect that page.');
    } finally {
      setLoading(false);
    }
  };

  const socialTitle = metadata?.og.title || metadata?.twitter.title || metadata?.title || 'Your page title';
  const socialDescription = metadata?.og.description || metadata?.twitter.description || metadata?.description || 'Your social description will appear here.';
  const socialImage = metadata?.og.image || metadata?.twitter.image || '';

  return (
    <section className="mx-auto max-w-7xl" aria-labelledby="meta-checker-title">
      <div className="mx-auto mb-8 max-w-3xl text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary"><Eye className="h-3.5 w-3.5" /> SEO + social inspector</div>
        <h2 id="meta-checker-title" className="text-4xl font-bold tracking-[-0.04em] text-white sm:text-5xl">See your page before everyone else does.</h2>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">Audit the tags that search engines and social networks read, with live Google, Open Graph, and X card previews.</p>
      </div>

      <div className="mx-auto max-w-4xl rounded-2xl border border-border bg-card p-4 shadow-2xl shadow-black/20">
        <div className="mb-3 flex gap-2">
          <button onClick={() => setPasteMode(false)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${!pasteMode ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}><Globe2 className="mr-1.5 inline h-3.5 w-3.5" />Fetch URL</button>
          <button onClick={() => setPasteMode(true)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${pasteMode ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}><Code2 className="mr-1.5 inline h-3.5 w-3.5" />Paste source</button>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <label className="flex min-w-0 flex-1 items-center gap-3 rounded-xl bg-canvas px-4 focus-within:ring-2 focus-within:ring-primary/30"><Globe2 className="h-4 w-4 shrink-0 text-primary" /><input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="example.com/page" className="min-w-0 flex-1 bg-transparent py-3 text-sm text-foreground outline-none" /></label>
          <button onClick={() => void analyze()} disabled={loading || !url.trim() || (pasteMode && !html.trim())} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Analyze page</button>
        </div>
        {pasteMode && <textarea value={html} onChange={(event) => setHtml(event.target.value)} placeholder="Paste the page's HTML source here…" className="mt-3 min-h-40 w-full resize-y rounded-xl border border-border bg-canvas p-4 font-mono text-xs leading-relaxed text-foreground outline-none focus:border-primary/50" />}
      </div>

      {error && <div role="alert" className="mx-auto mt-4 max-w-4xl rounded-xl border border-red-400/25 bg-red-400/10 px-4 py-3 text-sm text-red-200">{error}</div>}

      {metadata && (
        <div className="mt-7 grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="space-y-4">
            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-center justify-between"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Tag health</p><p className="mt-1 text-sm text-muted-foreground">{checks.filter((check) => check.ok).length} of {checks.length} checks pass</p></div><div className={`flex h-16 w-16 items-center justify-center rounded-full border-4 font-mono text-lg font-bold ${score >= 75 ? 'border-emerald-400/60 text-emerald-300' : score >= 50 ? 'border-amber-400/60 text-amber-300' : 'border-red-400/60 text-red-300'}`}>{score}</div></div>
              <div className="mt-5 space-y-2.5">{checks.map((check) => <div key={check.label} className="flex items-start gap-2.5"><span className={`mt-0.5 rounded-full p-0.5 ${check.ok ? 'bg-emerald-400/15 text-emerald-300' : 'bg-amber-400/15 text-amber-300'}`}>{check.ok ? <Check className="h-3 w-3" /> : <TriangleAlert className="h-3 w-3" />}</span><div className="min-w-0"><p className="text-xs font-semibold text-foreground">{check.label}</p><p className="mt-0.5 break-words text-[11px] leading-snug text-muted-foreground">{check.detail}</p></div></div>)}</div>
            </div>
            <div className="rounded-2xl border border-border bg-card p-5 text-xs text-muted-foreground"><p className="font-semibold text-foreground">Page details</p><dl className="mt-3 space-y-2"><div><dt className="text-[10px] uppercase tracking-wider">Language</dt><dd className="mt-0.5 text-foreground">{metadata.language || 'Not declared'}</dd></div><div><dt className="text-[10px] uppercase tracking-wider">Theme color</dt><dd className="mt-0.5 flex items-center gap-2 text-foreground">{metadata.themeColor && <span className="h-3 w-3 rounded-full border" style={{ background: metadata.themeColor }} />}{metadata.themeColor || 'Not declared'}</dd></div><div><dt className="text-[10px] uppercase tracking-wider">Read method</dt><dd className="mt-0.5 text-foreground">{metadata.route === 'relay' ? 'Browser-safe relay' : metadata.route === 'pasted' ? 'Pasted source' : 'Direct'}</dd></div></dl></div>
          </aside>

          <div className="min-w-0 space-y-4">
            <div className="rounded-2xl border border-border bg-card p-5"><p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Google search</p><div className="max-w-2xl rounded-xl bg-white p-5 font-sans"><p className="truncate text-sm text-[#202124]">{new URL(metadata.url).hostname} › {new URL(metadata.url).pathname.split('/').filter(Boolean).join(' › ')}</p><p className="mt-1 truncate text-xl text-[#1a0dab]">{metadata.title || 'Missing page title'}</p><p className="mt-1 line-clamp-2 text-sm leading-6 text-[#4d5156]">{metadata.description || 'No meta description was found. A search engine may choose text from the page instead.'}</p></div></div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="overflow-hidden rounded-2xl border border-border bg-card"><div className="aspect-[1.91/1] bg-secondary"><PreviewImage key={socialImage} src={socialImage} alt="Open Graph preview" /></div><div className="border-t border-border p-4"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">{new URL(metadata.url).hostname}</p><p className="mt-1 line-clamp-2 text-sm font-semibold text-foreground">{socialTitle}</p><p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{socialDescription}</p></div><p className="border-t border-border px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-primary">Open Graph · Facebook / LinkedIn</p></div>
              <div className="overflow-hidden rounded-2xl border border-border bg-black"><div className="aspect-[1.91/1] bg-secondary"><PreviewImage key={metadata.twitter.image || socialImage} src={metadata.twitter.image || socialImage} alt="X card preview" /></div><div className="border-t border-white/10 p-4"><p className="line-clamp-2 text-sm font-semibold text-white">{metadata.twitter.title || socialTitle}</p><p className="mt-1 line-clamp-2 text-xs text-white/60">{metadata.twitter.description || socialDescription}</p><p className="mt-2 text-[11px] text-white/45">{new URL(metadata.url).hostname}</p></div><p className="border-t border-white/10 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-primary">X / Twitter · {metadata.twitter.card || 'card type missing'}</p></div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5"><p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Detected tags</p><div className="space-y-2 font-mono text-xs">{[
              ['title', metadata.title], ['description', metadata.description], ['canonical', metadata.canonical], ['robots', metadata.robots], ['viewport', metadata.viewport],
              ...Object.entries(metadata.og).map(([key, value]) => [`og:${key}`, value]), ...Object.entries(metadata.twitter).map(([key, value]) => [`twitter:${key}`, value]),
            ].map(([key, value]) => <div key={key} className="grid gap-1 rounded-lg bg-canvas px-3 py-2.5 sm:grid-cols-[140px_1fr]"><span className="text-primary">{key}</span><span className="break-all text-muted-foreground">{value || <span className="inline-flex items-center gap-1 text-red-300"><X className="h-3 w-3" /> missing</span>}</span></div>)}</div></div>
          </div>
        </div>
      )}
    </section>
  );
}
