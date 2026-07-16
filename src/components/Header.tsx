import { LockKeyhole, PanelsTopLeft, Zap } from 'lucide-react';

export function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-border/75 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-[68px] w-full max-w-[1680px] items-center gap-3 px-4 sm:px-6">
        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-primary/25 bg-primary/10 text-primary shadow-[0_0_30px_hsl(var(--primary)/.08)]">
          <div className="absolute inset-x-0 bottom-0 h-0.5 bg-primary" />
          <PanelsTopLeft className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate font-display text-lg font-semibold tracking-tight sm:text-xl">Asset Workshop</h1>
            <span className="hidden rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.16em] text-muted-foreground sm:inline">Local</span>
          </div>
          <p className="hidden text-[11px] text-muted-foreground sm:block">Fast production fixes. No project setup.</p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden items-center gap-1.5 rounded-full border border-primary/15 bg-primary/[0.06] px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-primary md:flex">
            <Zap className="h-3 w-3" /> GPU aware
          </div>
          <div className="flex items-center gap-1.5 rounded-full border border-emerald-400/15 bg-emerald-400/[0.06] px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
            <LockKeyhole className="h-3 w-3" /> <span className="hidden sm:inline">Browser</span> local
          </div>
        </div>
      </div>
    </header>
  );
}
