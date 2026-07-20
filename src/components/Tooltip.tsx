import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';

const VIEWPORT_GUTTER = 8;
const TOOLTIP_GAP = 8;

// Render tooltips at the document root instead of inside their trigger. This
// lets them safely escape scroll panes, rounded canvases, and overflow-hidden
// cards while keeping their position tied to the trigger.
export function Tooltip({
  text,
  children,
  side = 'bottom',
}: {
  text: string;
  children: React.ReactNode;
  side?: 'bottom' | 'top';
}) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const tooltipId = useId();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    const tooltip = tooltipRef.current;
    if (!anchor || !tooltip) return;
    const trigger = anchor.getBoundingClientRect();
    const popup = tooltip.getBoundingClientRect();
    const canFitAbove = trigger.top - popup.height - TOOLTIP_GAP >= VIEWPORT_GUTTER;
    const canFitBelow = trigger.bottom + popup.height + TOOLTIP_GAP <= window.innerHeight - VIEWPORT_GUTTER;
    const openAbove = side === 'top' ? canFitAbove || !canFitBelow : !canFitBelow && canFitAbove;
    const top = openAbove ? trigger.top - popup.height - TOOLTIP_GAP : trigger.bottom + TOOLTIP_GAP;
    const left = Math.min(
      Math.max(VIEWPORT_GUTTER, trigger.left + trigger.width / 2 - popup.width / 2),
      window.innerWidth - popup.width - VIEWPORT_GUTTER,
    );
    setPosition({ top, left });
  }, [side]);

  useLayoutEffect(() => {
    if (open) updatePosition();
  }, [open, text, updatePosition]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, updatePosition]);

  return (
    <span
      ref={anchorRef}
      className="inline-flex align-middle"
      aria-describedby={open ? tooltipId : undefined}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && typeof document !== 'undefined' &&
        createPortal(
          <span
            ref={tooltipRef}
            id={tooltipId}
            role="tooltip"
            className="pointer-events-none fixed z-[100] w-max max-w-[calc(100vw-16px)] rounded-md border bg-popover px-2.5 py-1.5 text-xs leading-snug text-popover-foreground shadow-xl transition-opacity duration-150"
            style={{ top: position.top, left: position.left }}
          >
            {text}
          </span>,
          document.body,
        )}
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
