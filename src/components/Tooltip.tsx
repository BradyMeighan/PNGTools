import { Info } from 'lucide-react';

// Lightweight hover tooltip. Opens downward so it is not clipped by scroll
// containers, and never blocks clicks.
export function Tooltip({
  text,
  children,
  side = 'bottom',
}: {
  text: string;
  children: React.ReactNode;
  side?: 'bottom' | 'top';
}) {
  const pos =
    side === 'top'
      ? 'bottom-full mb-2 left-1/2 -translate-x-1/2'
      : 'top-full mt-2 left-1/2 -translate-x-1/2';
  return (
    <span className="relative inline-flex group/tt align-middle">
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute z-50 ${pos} w-max max-w-[240px] rounded-md border bg-popover px-2.5 py-1.5 text-xs leading-snug text-popover-foreground shadow-xl opacity-0 group-hover/tt:opacity-100 transition-opacity duration-150`}
      >
        {text}
      </span>
    </span>
  );
}

export function InfoTip({ text }: { text: string }) {
  return (
    <Tooltip text={text}>
      <Info className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground cursor-help" />
    </Tooltip>
  );
}
