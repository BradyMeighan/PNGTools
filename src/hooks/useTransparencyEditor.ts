import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createState,
  applyOp,
  foldOps,
  render,
  pixelColorAt,
  type TransparencyState,
} from '../lib/transparency/engine';
import { detectBackground } from '../lib/transparency/analyze';
import { aiCutout } from '../lib/transparency/cutout';
import {
  DEFAULT_RENDER_SETTINGS,
  type RemovalOp,
  type RenderSettings,
  type RGB,
  type DistanceMetric,
} from '../lib/transparency/types';
import type { ImagePoint } from '../components/ZoomPanCanvas';

let opCounter = 0;
const nextId = () => `op_${++opCounter}`;

// The user only ever picks one of two intents. Everything else is automatic.
export type Action = 'erase' | 'restore';

export interface ToolSettings {
  tool: 'wand' | 'brush';
  action: Action;
  color: RGB;
  tolerance: number; // 0..1
  softness: number; // 0..1
  contiguous: boolean;
  brushSize: number; // px in image space
  brushHardness: number; // 0..1
}

const DEFAULT_TOOL: ToolSettings = {
  tool: 'wand',
  action: 'erase',
  color: { r: 255, g: 255, b: 255 },
  tolerance: 0.08,
  softness: 0.05,
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
  const [aiBusy, setAiBusy] = useState(false);
  const [aiProgress, setAiProgress] = useState<{ p: number; label: string } | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

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

  useEffect(() => {
    const st = stateRef.current;
    if (!st) return;
    setBusy(true);
    foldOps(st, ops, settingsRef.current.metric);
    blit();
    setBusy(false);
  }, [ops, blit]);

  useEffect(() => {
    scheduleBlit();
  }, [settings, scheduleBlit]);

  // Build the automatic "remove the background" op from a detected color.
  const buildAutoOp = useCallback((st: TransparencyState): RemovalOp => {
    const guess = detectBackground(st.src, st.width, st.height);
    setToolState((t) => ({
      ...t,
      color: guess.color,
      tolerance: guess.tolerance,
      softness: guess.softness,
      action: 'erase',
    }));
    return {
      id: nextId(),
      kind: 'flood',
      fromEdges: true,
      mode: 'new',
      color: guess.color,
      tolerance: guess.tolerance,
      softness: guess.softness,
      contiguous: true,
    };
  }, []);

  const loadImageElement = useCallback(
    (img: HTMLImageElement) => {
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
      setRedoStack([]);
      setImageSize({ w, h });
      // Instant result: auto-detect and remove the background on upload.
      setOps([buildAutoOp(stateRef.current)]);
    },
    [buildAutoOp],
  );

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

  // Re-run automatic background detection (the "Auto" button). Undoable.
  const autoRemove = useCallback(() => {
    const st = stateRef.current;
    if (!st) return;
    setOps((prev) => [...prev, buildAutoOp(st)]);
    setRedoStack([]);
  }, [buildAutoOp]);

  const commitOp = useCallback((op: RemovalOp) => {
    setOps((prev) => [...prev, op]);
    setRedoStack([]);
  }, []);

  // A click erases (or restores) a region around the picked color.
  const wandAt = useCallback(
    (pt: ImagePoint, action: Action) => {
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
        mode: action === 'restore' ? 'subtract' : 'add',
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

  const retuneLast = useCallback((patch: { tolerance?: number; softness?: number }) => {
    setOps((prev) => {
      if (!prev.length) return prev;
      const last = prev[prev.length - 1];
      if (last.kind !== 'flood' && last.kind !== 'global') return prev;
      return [...prev.slice(0, -1), { ...last, ...patch }];
    });
  }, []);

  const beginStroke = useCallback(
    (pt: ImagePoint, action: Action) => {
      const st = stateRef.current;
      if (!st) return;
      const t = toolRef.current;
      const op: RemovalOp = {
        id: nextId(),
        kind: 'brush',
        mode: action === 'restore' ? 'subtract' : 'add',
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
    (mask: Uint8Array) => {
      commitOp({ id: nextId(), kind: 'ai', mode: 'new', tolerance: 0, softness: 0, aiMask: mask });
    },
    [commitOp],
  );

  // One-click AI subject cutout. Result seeds the mask so it can still be refined.
  const runAiCutout = useCallback(async () => {
    const st = stateRef.current;
    if (!st || aiBusy) return;
    setAiBusy(true);
    setAiError(null);
    setAiProgress({ p: 0, label: 'Starting…' });
    try {
      const mask = await aiCutout(st.src, st.width, st.height, (p, label) => setAiProgress({ p, label }));
      pushAiMask(mask);
    } catch (e) {
      console.error('AI cutout failed', e);
      setAiError('AI background removal could not run. Make sure you are online the first time you use it.');
    } finally {
      setAiBusy(false);
      setAiProgress(null);
    }
  }, [aiBusy, pushAiMask]);

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

  // Reset back to just the automatic background removal (not a blank slate),
  // so "Reset" is forgiving rather than destructive.
  const reset = useCallback(() => {
    const st = stateRef.current;
    if (!st) return;
    setOps([buildAutoOp(st)]);
    setRedoStack([]);
  }, [buildAutoOp]);

  const exportBlob = useCallback(async (): Promise<Blob | null> => {
    const st = stateRef.current;
    if (!st) return null;
    const c = document.createElement('canvas');
    c.width = st.width;
    c.height = st.height;
    c.getContext('2d')!.putImageData(render(st, settingsRef.current), 0, 0);
    return new Promise((resolve) => c.toBlob(resolve, 'image/png'));
  }, []);

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
    autoRemove,
    runAiCutout,
    aiBusy,
    aiProgress,
    aiError,
    undo,
    redo,
    reset,
    canUndo: ops.length > 1,
    canRedo: redoStack.length > 0,
    exportBlob,
  };
}
