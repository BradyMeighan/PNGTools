import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  forwardRef,
} from 'react';
import { Maximize2, Minus, Plus, Hand } from 'lucide-react';
import { cn } from '../lib/utils';

export interface ImagePoint {
  x: number;
  y: number;
}

export interface ZoomPanHandle {
  fit: () => void;
  reset: () => void;
  screenToImage: (clientX: number, clientY: number) => ImagePoint;
}

interface ZoomPanCanvasProps {
  imageWidth: number;
  imageHeight: number;
  className?: string;
  checkerboard?: boolean;
  cursor?: string;
  /** When true, the primary button always pans instead of forwarding to the tool. */
  panMode?: boolean;
  onImagePointerDown?: (pt: ImagePoint, e: React.PointerEvent) => void;
  onImagePointerMove?: (pt: ImagePoint, e: React.PointerEvent) => void;
  onImagePointerUp?: (pt: ImagePoint, e: React.PointerEvent) => void;
  /** Layers rendered in image space (e.g. a <canvas width={imageWidth} ...>). */
  children?: React.ReactNode;
  showControls?: boolean;
  onTogglePan?: () => void;
}

const MIN_SCALE = 0.05;
const MAX_SCALE = 40;

// A reusable zoom/pan surface driven by a single affine transform {scale, tx, ty}.
// The transform is held in a ref and written straight to the DOM so panning stays
// at 60fps without re-rendering React. Screen->image mapping is the exact inverse
// of the applied transform, so pixel picking stays accurate at any zoom.
export const ZoomPanCanvas = forwardRef<ZoomPanHandle, ZoomPanCanvasProps>(function ZoomPanCanvas(
  {
    imageWidth,
    imageHeight,
    className,
    checkerboard = true,
    cursor = 'crosshair',
    panMode = false,
    onImagePointerDown,
    onImagePointerMove,
    onImagePointerUp,
    children,
    showControls = true,
    onTogglePan,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const tf = useRef({ scale: 1, tx: 0, ty: 0 });
  const [zoomLabel, setZoomLabel] = useState(100);

  // Active pointers for pinch, and pan bookkeeping.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const panning = useRef(false);
  const spaceHeld = useRef(false);
  const pinchStart = useRef<{ dist: number; scale: number; cx: number; cy: number } | null>(null);

  const applyTransform = useCallback(() => {
    const el = contentRef.current;
    if (!el) return;
    const { scale, tx, ty } = tf.current;
    el.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    setZoomLabel(Math.round(scale * 100));
  }, []);

  const fit = useCallback(() => {
    const c = containerRef.current;
    if (!c || !imageWidth || !imageHeight) return;
    const pad = 16;
    const sw = c.clientWidth - pad * 2;
    const sh = c.clientHeight - pad * 2;
    const scale = Math.min(sw / imageWidth, sh / imageHeight, 1);
    tf.current = {
      scale,
      tx: (c.clientWidth - imageWidth * scale) / 2,
      ty: (c.clientHeight - imageHeight * scale) / 2,
    };
    applyTransform();
  }, [imageWidth, imageHeight, applyTransform]);

  const reset = useCallback(() => fit(), [fit]);

  const screenToImage = useCallback((clientX: number, clientY: number): ImagePoint => {
    const c = containerRef.current;
    const { scale, tx, ty } = tf.current;
    const rect = c?.getBoundingClientRect();
    const sx = clientX - (rect?.left ?? 0);
    const sy = clientY - (rect?.top ?? 0);
    return { x: (sx - tx) / scale, y: (sy - ty) / scale };
  }, []);

  useImperativeHandle(ref, () => ({ fit, reset, screenToImage }), [fit, reset, screenToImage]);

  // Fit whenever the image size changes.
  useLayoutEffect(() => {
    fit();
  }, [fit]);

  // Zoom toward a screen point by a multiplicative factor.
  const zoomAt = useCallback(
    (factor: number, cx: number, cy: number) => {
      const t = tf.current;
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, t.scale * factor));
      const k = newScale / t.scale;
      // Keep the point under the cursor fixed: tx' = cx - (cx - tx) * k.
      t.tx = cx - (cx - t.tx) * k;
      t.ty = cy - (cy - t.ty) * k;
      t.scale = newScale;
      applyTransform();
    },
    [applyTransform],
  );

  // Wheel zoom needs a non-passive listener so we can preventDefault the page scroll.
  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = c.getBoundingClientRect();
      const factor = Math.exp(-e.deltaY * 0.0015);
      zoomAt(factor, e.clientX - rect.left, e.clientY - rect.top);
    };
    c.addEventListener('wheel', onWheel, { passive: false });
    return () => c.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  // Track Space for hold-to-pan.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceHeld.current = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceHeld.current = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const wantsPan = (e: React.PointerEvent) =>
    panMode || spaceHeld.current || e.button === 1 || e.button === 2;

  const handlePointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2) {
      const pts = [...pointers.current.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const rect = containerRef.current!.getBoundingClientRect();
      pinchStart.current = {
        dist,
        scale: tf.current.scale,
        cx: (pts[0].x + pts[1].x) / 2 - rect.left,
        cy: (pts[0].y + pts[1].y) / 2 - rect.top,
      };
      panning.current = false;
      return;
    }

    if (wantsPan(e)) {
      panning.current = true;
      return;
    }
    onImagePointerDown?.(screenToImage(e.clientX, e.clientY), e);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (prev) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2 && pinchStart.current) {
      const pts = [...pointers.current.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const factor = (dist / pinchStart.current.dist) * (pinchStart.current.scale / tf.current.scale);
      zoomAt(factor, pinchStart.current.cx, pinchStart.current.cy);
      return;
    }

    if (panning.current && prev) {
      tf.current.tx += e.clientX - prev.x;
      tf.current.ty += e.clientY - prev.y;
      applyTransform();
      return;
    }
    if (!panning.current) onImagePointerMove?.(screenToImage(e.clientX, e.clientY), e);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
    if (panning.current) {
      panning.current = false;
      return;
    }
    onImagePointerUp?.(screenToImage(e.clientX, e.clientY), e);
  };

  return (
    <div
      ref={containerRef}
      className={cn('relative overflow-hidden rounded-xl border bg-secondary/20 select-none', className)}
      style={{ touchAction: 'none', cursor: panMode ? 'grab' : cursor }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        ref={contentRef}
        className="absolute top-0 left-0 origin-top-left"
        style={{ width: imageWidth, height: imageHeight }}
      >
        {checkerboard && (
          <div className="checkerboard absolute inset-0" style={{ width: imageWidth, height: imageHeight }} />
        )}
        {children}
      </div>

      {showControls && (
        <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-lg border bg-card/90 backdrop-blur px-1 py-1 shadow-lg">
          {onTogglePan && (
            <button
              onClick={onTogglePan}
              className={cn(
                'p-1.5 rounded-md transition-colors',
                panMode ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary',
              )}
              title="Pan tool (or hold Space)"
            >
              <Hand className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => {
              const c = containerRef.current!;
              zoomAt(0.8, c.clientWidth / 2, c.clientHeight / 2);
            }}
            className="p-1.5 rounded-md hover:bg-secondary transition-colors"
            title="Zoom out"
          >
            <Minus className="w-4 h-4" />
          </button>
          <span className="text-xs font-mono w-12 text-center tabular-nums">{zoomLabel}%</span>
          <button
            onClick={() => {
              const c = containerRef.current!;
              zoomAt(1.25, c.clientWidth / 2, c.clientHeight / 2);
            }}
            className="p-1.5 rounded-md hover:bg-secondary transition-colors"
            title="Zoom in"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={fit}
            className="p-1.5 rounded-md hover:bg-secondary transition-colors"
            title="Fit to screen"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
});
