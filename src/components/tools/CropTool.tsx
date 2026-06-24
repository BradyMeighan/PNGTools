import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Crop, Download, Copy, RotateCcw, Scan } from 'lucide-react';
import { ImageUploader } from '../ImageUploader';
import { Tooltip, InfoTip } from '../Tooltip';
import { detectContentBounds, type Rect } from '../../lib/crop';

interface Preset {
  label: string;
  a: number; // aspect ratio (w/h); 0 = free, -1 = original
  tw?: number; // exact export width
  th?: number; // exact export height
}

const PRESETS: Preset[] = [
  { label: 'Free', a: 0 },
  { label: 'Original', a: -1 },
  { label: '1:1', a: 1 },
  { label: '16:9', a: 16 / 9 },
  { label: '4:3', a: 4 / 3 },
  { label: '3:2', a: 3 / 2 },
  { label: '9:16', a: 9 / 16 },
  { label: 'OG image', a: 1200 / 630, tw: 1200, th: 630 },
];

type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'move';

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

function fitAspect(a: number, iw: number, ih: number): Rect {
  let w = iw;
  let h = w / a;
  if (h > ih) {
    h = ih;
    w = h * a;
  }
  return { x: (iw - w) / 2, y: (ih - h) / 2, w, h };
}

function applyDrag(handle: HandleId, s: Rect, dx: number, dy: number, aspect: number, iw: number, ih: number): Rect {
  const MIN = 8;
  if (handle === 'move') {
    return { x: clamp(s.x + dx, 0, iw - s.w), y: clamp(s.y + dy, 0, ih - s.h), w: s.w, h: s.h };
  }
  let L = s.x;
  let T = s.y;
  let R = s.x + s.w;
  let B = s.y + s.h;
  if (handle.includes('w')) L = clamp(s.x + dx, 0, R - MIN);
  if (handle.includes('e')) R = clamp(s.x + s.w + dx, L + MIN, iw);
  if (handle.includes('n')) T = clamp(s.y + dy, 0, B - MIN);
  if (handle.includes('s')) B = clamp(s.y + s.h + dy, T + MIN, ih);

  let nx = L;
  let ny = T;
  let nw = R - L;
  let nh = B - T;

  if (aspect > 0) {
    const movingTop = handle.includes('n');
    const movingLeft = handle.includes('w');
    nh = nw / aspect;
    ny = movingTop ? B - nh : T;
    if (ny < 0) {
      ny = 0;
      nh = B - ny;
      nw = nh * aspect;
      if (movingLeft) nx = R - nw;
    }
    if (ny + nh > ih) {
      nh = ih - ny;
      nw = nh * aspect;
      if (movingLeft) nx = R - nw;
    }
  }
  return { x: nx, y: ny, w: nw, h: nh };
}

export function CropTool() {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [crop, setCrop] = useState<Rect>({ x: 0, y: 0, w: 0, h: 0 });
  const [presetIdx, setPresetIdx] = useState(0);
  const [format, setFormat] = useState('image/png');
  const [copied, setCopied] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const drag = useRef<{ handle: HandleId; startCrop: Rect; sx: number; sy: number } | null>(null);
  const latest = useRef({ scale: 1, aspect: 0, iw: 0, ih: 0 });

  const iw = img?.naturalWidth ?? 0;
  const ih = img?.naturalHeight ?? 0;
  const aspect = PRESETS[presetIdx].a === -1 ? iw / ih : PRESETS[presetIdx].a;

  // Track the container size so the displayed geometry stays correct on resize.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [img]);

  const geom = useMemo(() => {
    if (!iw || !ih || !box.w || !box.h) return null;
    const scale = Math.min(box.w / iw, box.h / ih);
    const dispW = iw * scale;
    const dispH = ih * scale;
    return { scale, offX: (box.w - dispW) / 2, offY: (box.h - dispH) / 2, dispW, dispH };
  }, [iw, ih, box]);

  useEffect(() => {
    latest.current = { scale: geom?.scale ?? 1, aspect, iw, ih };
  }, [geom, aspect, iw, ih]);

  const loadFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const image = new Image();
      image.onload = () => {
        setImg(image);
        setCrop({ x: 0, y: 0, w: image.naturalWidth, h: image.naturalHeight });
        setPresetIdx(0);
      };
      image.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  }, []);

  const onMove = useCallback((e: PointerEvent) => {
    const d = drag.current;
    const l = latest.current;
    if (!d) return;
    const dx = (e.clientX - d.sx) / l.scale;
    const dy = (e.clientY - d.sy) / l.scale;
    setCrop(applyDrag(d.handle, d.startCrop, dx, dy, l.aspect, l.iw, l.ih));
  }, []);

  const onUp = useCallback(() => {
    drag.current = null;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  }, [onMove]);

  const startDrag = (handle: HandleId) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    drag.current = { handle, startCrop: crop, sx: e.clientX, sy: e.clientY };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const choosePreset = (i: number) => {
    setPresetIdx(i);
    const a = PRESETS[i].a === -1 ? iw / ih : PRESETS[i].a;
    if (a > 0) setCrop(fitAspect(a, iw, ih));
  };

  const cropToEdges = () => {
    if (!img) return;
    setPresetIdx(0);
    setCrop(detectContentBounds(img));
  };

  const renderToBlob = useCallback(async (): Promise<Blob | null> => {
    if (!img) return null;
    const preset = PRESETS[presetIdx];
    const outW = Math.max(1, Math.round(preset.tw ?? crop.w));
    const outH = Math.max(1, Math.round(preset.th ?? crop.h));
    const c = document.createElement('canvas');
    c.width = outW;
    c.height = outH;
    const ctx = c.getContext('2d')!;
    if (format !== 'image/png') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, outW, outH);
    }
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, outW, outH);
    return new Promise((res) => c.toBlob(res, format, 0.92));
  }, [img, crop, presetIdx, format]);

  const download = async () => {
    const blob = await renderToBlob();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cropped.${format.split('/')[1].replace('jpeg', 'jpg')}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copy = async () => {
    const blob = await renderToBlob();
    if (!blob) return;
    try {
      const out = blob.type === 'image/png' ? blob : await (await fetch(URL.createObjectURL(blob))).blob();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': out })]);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error('Copy failed', err);
    }
  };

  if (!img) {
    return (
      <div className="max-w-2xl mx-auto mt-10">
        <div className="text-center mb-10 space-y-4">
          <div className="flex items-center justify-center gap-3 mb-2">
            <Crop className="w-9 h-9 text-primary" />
            <h2 className="text-4xl font-bold tracking-tight">Crop Image</h2>
          </div>
          <p className="text-muted-foreground text-lg">
            Drag to crop, snap to common sizes, or auto-trim the edges in one click. Instant, no
            slow app to load.
          </p>
        </div>
        <ImageUploader onImageSelect={loadFile} />
      </div>
    );
  }

  // Screen rect of the crop box.
  const sx = (geom?.offX ?? 0) + crop.x * (geom?.scale ?? 1);
  const sy = (geom?.offY ?? 0) + crop.y * (geom?.scale ?? 1);
  const sw = crop.w * (geom?.scale ?? 1);
  const sh = crop.h * (geom?.scale ?? 1);

  const handles: { id: HandleId; cursor: string; cx: number; cy: number }[] = [
    { id: 'nw', cursor: 'nwse-resize', cx: sx, cy: sy },
    { id: 'ne', cursor: 'nesw-resize', cx: sx + sw, cy: sy },
    { id: 'se', cursor: 'nwse-resize', cx: sx + sw, cy: sy + sh },
    { id: 'sw', cursor: 'nesw-resize', cx: sx, cy: sy + sh },
    ...(aspect > 0
      ? []
      : ([
          { id: 'n', cursor: 'ns-resize', cx: sx + sw / 2, cy: sy },
          { id: 'e', cursor: 'ew-resize', cx: sx + sw, cy: sy + sh / 2 },
          { id: 's', cursor: 'ns-resize', cx: sx + sw / 2, cy: sy + sh },
          { id: 'w', cursor: 'ew-resize', cx: sx, cy: sy + sh / 2 },
        ] as const)),
  ];

  const outW = Math.round(PRESETS[presetIdx].tw ?? crop.w);
  const outH = Math.round(PRESETS[presetIdx].th ?? crop.h);

  return (
    <div className="grid lg:grid-cols-[300px_1fr] gap-6 h-[calc(100vh-12rem)]">
      {/* Controls */}
      <div className="space-y-5 p-5 bg-card rounded-xl border shadow-sm h-fit overflow-y-auto max-h-[calc(100vh-12rem)]">
        <Tooltip text="Automatically trim a solid-color or transparent border down to the content.">
          <button
            onClick={cropToEdges}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
          >
            <Scan className="w-4 h-4" /> Crop to edges
          </button>
        </Tooltip>

        <div className="space-y-2">
          <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            Aspect ratio <InfoTip text="Lock the crop to a shape. 'OG image' exports exactly 1200x630 for social/link previews." />
          </span>
          <div className="grid grid-cols-3 gap-1.5">
            {PRESETS.map((p, i) => (
              <button
                key={p.label}
                onClick={() => choosePreset(i)}
                className={`py-1.5 text-xs rounded-md border transition-colors ${
                  presetIdx === i ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-secondary'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-3 bg-secondary/20 rounded-lg text-sm flex justify-between">
          <span className="text-muted-foreground">Output</span>
          <span className="font-mono">{outW} × {outH}</span>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Format</label>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value)}
            className="w-full bg-secondary border-none rounded-lg px-3 py-2 text-sm"
          >
            <option value="image/png">PNG</option>
            <option value="image/jpeg">JPEG</option>
            <option value="image/webp">WebP</option>
          </select>
        </div>

        <div className="flex gap-2">
          <button
            onClick={copy}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 bg-secondary rounded-lg text-sm font-medium hover:bg-secondary/80 transition-colors"
          >
            <Copy className="w-4 h-4" /> {copied ? 'Copied!' : 'Copy'}
          </button>
          <button
            onClick={download}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Download className="w-4 h-4" /> Save
          </button>
        </div>

        <button
          onClick={() => setImg(null)}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <RotateCcw className="w-4 h-4" /> New image
        </button>
      </div>

      {/* Crop canvas */}
      <div ref={containerRef} className="relative rounded-xl border bg-secondary/20 overflow-hidden select-none">
        <div className="absolute inset-0 checkerboard opacity-30" />
        {geom && (
          <>
            <img
              src={img.src}
              alt="To crop"
              draggable={false}
              className="absolute"
              style={{ left: geom.offX, top: geom.offY, width: geom.dispW, height: geom.dispH }}
            />
            {/* Crop box with darkened surroundings */}
            <div
              className="absolute border-2 border-primary cursor-move"
              style={{ left: sx, top: sy, width: sw, height: sh, boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)' }}
              onPointerDown={startDrag('move')}
            >
              {/* rule-of-thirds guides */}
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-1/3 left-0 right-0 border-t border-white/30" />
                <div className="absolute top-2/3 left-0 right-0 border-t border-white/30" />
                <div className="absolute left-1/3 top-0 bottom-0 border-l border-white/30" />
                <div className="absolute left-2/3 top-0 bottom-0 border-l border-white/30" />
              </div>
            </div>
            {handles.map((h) => (
              <div
                key={h.id}
                onPointerDown={startDrag(h.id)}
                className="absolute w-3 h-3 bg-primary border border-white rounded-sm"
                style={{ left: h.cx - 6, top: h.cy - 6, cursor: h.cursor }}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
