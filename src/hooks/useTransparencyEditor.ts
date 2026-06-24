import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createState,
  applyOp,
  foldOps,
  render,
  pixelColorAt,
  type TransparencyState,
} from '../lib/transparency/engine';
import {
  DEFAULT_RENDER_SETTINGS,
  type RemovalOp,
  type RenderSettings,
  type SelectionMode,
  type RGB,
  type DistanceMetric,
} from '../lib/transparency/types';
import type { ImagePoint } from '../components/ZoomPanCanvas';

let opCounter = 0;
const nextId = () => `op_${++opCounter}`;

export interface ToolSettings {
  tool: 'wand' | 'brush';
  mode: SelectionMode;
  color: RGB;
  tolerance: number; // 0..1
  softness: number; // 0..1
  contiguous: boolean;
  brushSize: number; // px in image space
  brushHardness: number; // 0..1
}

const DEFAULT_TOOL: ToolSettings = {
  tool: 'wand',
  mode: 'add',
  color: { r: 255, g: 255, b: 255 },
  tolerance: 0.08,
  softness: 0.04,
  contiguous: true,
  brushSize: 28,
  brushHardness: 0.6,
};

export function useTransparencyEditor() {
  const stateRef = useRef<TransparencyState | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const liveStroke = useRef<RemovalOp | null>(null);
  const rafRef = useRef<number | null>(null);

  const [imageSize, setImageSize] = useState<{ w: number; h: number } | null>(null);
  const [ops, setOps] = useState<RemovalOp[]>([]);
  const [redoStack, setRedoStack] = useState<RemovalOp[]>([]);
  const [tool, setToolState] = useState<ToolSettings>(DEFAULT_TOOL);
  const [settings, setSettingsState] = useState<RenderSettings>(DEFAULT_RENDER_SETTINGS);
  const [busy, setBusy] = useState(false);

  // Refs mirror the latest state so rAF/pointer callbacks never read stale closures.
  const settingsRef = useRef(settings);
  const metricRef = useRef<DistanceMetric>(settings.metric);
  const toolRef = useRef(tool);
  useEffect(() => {
    settingsRef.current = settings;
    metricRef.current = settings.metric;
  }, [settings]);
  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);

  const setTool = useCallback((patch: Partial<ToolSettings>) => setToolState((t) => ({ ...t, ...patch })), []);
  const setSettings = useCallback(
    (patch: Partial<RenderSettings>) => setSettingsState((s) => ({ ...s, ...patch })),
    [],
  );

  const bindCanvas = useCallback((el: HTMLCanvasElement | null) => {
    canvasRef.current = el;
  }, []);

  // Draw the current engine output into the bound display canvas.
  const blit = useCallback(() => {
    const st = stateRef.current;
    const cv = canvasRef.current;
    if (!st || !cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.putImageData(render(st, settingsRef.current), 0, 0);
  }, []);

  const scheduleBlit = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      blit();
    });
  }, [blit]);

  // Re-fold whenever the committed op list changes, then redraw.
  useEffect(() => {
    const st = stateRef.current;
    if (!st) return;
    setBusy(true);
    foldOps(st, ops, settingsRef.current.metric);
    blit();
    setBusy(false);
  }, [ops, blit]);

  // Redraw when render settings change (no refold needed; render reads buffers).
  useEffect(() => {
    scheduleBlit();
  }, [settings, scheduleBlit]);

  const loadImageElement = useCallback((img: HTMLImageElement) => {
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, w, h).data;
    stateRef.current = createState(w, h, data);
    opCounter = 0;
    setOps([]);
    setRedoStack([]);
    setImageSize({ w, h });
  }, []);

  const loadFile = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => loadImageElement(img);
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    },
    [loadImageElement],
  );

  const commitOp = useCallback((op: RemovalOp) => {
    setOps((prev) => [...prev, op]);
    setRedoStack([]);
  }, []);

  // Wand click: pick the color under the cursor, then remove/add/subtract a region.
  const wandAt = useCallback(
    (pt: ImagePoint, mode: SelectionMode) => {
      const st = stateRef.current;
      if (!st) return;
      const x = Math.floor(pt.x);
      const y = Math.floor(pt.y);
      if (x < 0 || y < 0 || x >= st.width || y >= st.height) return;
      const color = pixelColorAt(st, x, y);
      setToolState((t) => ({ ...t, color }));
      const t = toolRef.current;
      commitOp({
        id: nextId(),
        kind: t.contiguous ? 'flood' : 'global',
        mode,
        color,
        tolerance: t.tolerance,
        softness: t.softness,
        contiguous: t.contiguous,
        seedX: x,
        seedY: y,
      });
    },
    [commitOp],
  );

  // Live re-tune of the most recent color op while dragging tolerance/softness.
  const retuneLast = useCallback((patch: { tolerance?: number; softness?: number }) => {
    setOps((prev) => {
      if (!prev.length) return prev;
      const last = prev[prev.length - 1];
      if (last.kind !== 'flood' && last.kind !== 'global') return prev;
      const updated = { ...last, ...patch };
      return [...prev.slice(0, -1), updated];
    });
  }, []);

  // Brush stroke lifecycle. During the drag we stamp incrementally for smoothness
  // and only commit the full stroke as one undoable op on release.
  const beginStroke = useCallback(
    (pt: ImagePoint) => {
      const st = stateRef.current;
      if (!st) return;
      const t = toolRef.current;
      const op: RemovalOp = {
        id: nextId(),
        kind: 'brush',
        mode: t.mode === 'subtract' ? 'subtract' : 'add',
        tolerance: 0,
        softness: 0,
        stroke: [{ x: pt.x, y: pt.y }],
        radius: t.brushSize / 2,
        hardness: t.brushHardness,
      };
      liveStroke.current = op;
      applyOp(st, { ...op }, metricRef.current);
      scheduleBlit();
    },
    [scheduleBlit],
  );

  const extendStroke = useCallback(
    (pt: ImagePoint) => {
      const st = stateRef.current;
      const op = liveStroke.current;
      if (!st || !op || !op.stroke) return;
      const prev = op.stroke[op.stroke.length - 1];
      op.stroke.push({ x: pt.x, y: pt.y });
      // Stamp only the new segment for speed.
      applyOp(st, { ...op, stroke: [prev, { x: pt.x, y: pt.y }] }, metricRef.current);
      scheduleBlit();
    },
    [scheduleBlit],
  );

  const endStroke = useCallback(() => {
    const op = liveStroke.current;
    liveStroke.current = null;
    if (op && op.stroke && op.stroke.length) {
      setOps((prev) => [...prev, op]);
      setRedoStack([]);
    }
  }, []);

  const pushAiMask = useCallback(
    (mask: Uint8Array, mode: SelectionMode = 'new') => {
      commitOp({ id: nextId(), kind: 'ai', mode, tolerance: 0, softness: 0, aiMask: mask });
    },
    [commitOp],
  );

  const undo = useCallback(() => {
    setOps((prev) => {
      if (!prev.length) return prev;
      const last = prev[prev.length - 1];
      setRedoStack((r) => [...r, last]);
      return prev.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setRedoStack((r) => {
      if (!r.length) return r;
      const op = r[r.length - 1];
      setOps((prev) => [...prev, op]);
      return r.slice(0, -1);
    });
  }, []);

  const clear = useCallback(() => {
    setOps([]);
    setRedoStack([]);
  }, []);

  const exportBlob = useCallback(async (): Promise<Blob | null> => {
    const st = stateRef.current;
    if (!st) return null;
    const c = document.createElement('canvas');
    c.width = st.width;
    c.height = st.height;
    c.getContext('2d')!.putImageData(render(st, settingsRef.current), 0, 0);
    return new Promise((resolve) => c.toBlob(resolve, 'image/png'));
  }, []);

  // Keyboard: Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z (or Ctrl+Y) redo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.ctrlKey || e.metaKey;
      if (!meta) return;
      if (e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  return {
    imageSize,
    bindCanvas,
    loadFile,
    ops,
    tool,
    setTool,
    settings,
    setSettings,
    busy,
    wandAt,
    retuneLast,
    beginStroke,
    extendStroke,
    endStroke,
    pushAiMask,
    undo,
    redo,
    clear,
    canUndo: ops.length > 0,
    canRedo: redoStack.length > 0,
    exportBlob,
  };
}
