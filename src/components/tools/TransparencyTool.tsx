import { useRef, useState } from 'react';
import { HexColorPicker } from 'react-colorful';
import {
  Download,
  Copy,
  RotateCcw,
  Undo2,
  Redo2,
  Wand2,
  Brush,
  Eraser,
  Plus,
  Minus,
  Sparkles,
  Layers,
} from 'lucide-react';
import { ImageUploader } from '../ImageUploader';
import { ZoomPanCanvas, type ImagePoint, type ZoomPanHandle } from '../ZoomPanCanvas';
import { useTransparencyEditor } from '../../hooks/useTransparencyEditor';
import { rgbToHex, hexToRgb } from '../../lib/transparency/color';
import type { SelectionMode, DistanceMetric } from '../../lib/transparency/types';

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 pb-2 border-b">
        <Icon className="w-4 h-4 text-primary" />
        <h3 className="font-semibold text-sm">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground font-mono">{format ? format(value) : value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
      />
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-3 p-2.5 rounded-lg border bg-secondary/20 cursor-pointer hover:bg-secondary/30 transition-colors">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 rounded border-primary text-primary focus:ring-primary"
      />
      <span className="text-sm font-medium">{label}</span>
    </label>
  );
}

export function TransparencyTool() {
  const ed = useTransparencyEditor();
  const zoomRef = useRef<ZoomPanHandle>(null);
  const drawing = useRef(false);
  const [panMode, setPanMode] = useState(false);
  const [copied, setCopied] = useState(false);

  const onDown = (pt: ImagePoint, e: React.PointerEvent) => {
    if (ed.tool.tool === 'brush') {
      drawing.current = true;
      ed.beginStroke(pt);
    } else {
      const mode: SelectionMode = e.shiftKey ? 'add' : e.altKey ? 'subtract' : ed.tool.mode;
      ed.wandAt(pt, mode);
    }
  };
  const onMove = (pt: ImagePoint) => {
    if (ed.tool.tool === 'brush' && drawing.current) ed.extendStroke(pt);
  };
  const onUp = () => {
    if (ed.tool.tool === 'brush' && drawing.current) {
      drawing.current = false;
      ed.endStroke();
    }
  };

  const handleDownload = async () => {
    const blob = await ed.exportBlob();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = ed.settings.replaceColor ? 'image.png' : 'transparent.png';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopy = async () => {
    const blob = await ed.exportBlob();
    if (!blob) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error('Copy failed', err);
    }
  };

  if (!ed.imageSize) {
    return (
      <div className="max-w-2xl mx-auto mt-10">
        <div className="text-center mb-10 space-y-4">
          <h2 className="text-4xl font-bold tracking-tight bg-gradient-to-br from-white to-white/60 bg-clip-text text-transparent">
            Remove Backgrounds, Cleanly
          </h2>
          <p className="text-muted-foreground text-lg">
            Click to erase colors with smooth, halo-free edges. Stack multiple clicks, zoom in,
            and fine-tune. Runs entirely in your browser.
          </p>
        </div>
        <ImageUploader onImageSelect={ed.loadFile} />
      </div>
    );
  }

  const { tool } = ed;
  const modeChip = (mode: SelectionMode, label: string, Icon: React.ElementType) => (
    <button
      onClick={() => ed.setTool({ mode })}
      className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-md border transition-colors ${
        tool.mode === mode ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-secondary'
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );

  return (
    <div className="grid lg:grid-cols-[320px_1fr] gap-6 h-[calc(100vh-12rem)]">
      {/* Sidebar */}
      <div className="space-y-5 p-5 bg-card rounded-xl border shadow-sm overflow-y-auto max-h-[calc(100vh-12rem)]">
        {/* Tool selector */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => ed.setTool({ tool: 'wand' })}
            className={`flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg border transition-colors ${
              tool.tool === 'wand' ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-secondary'
            }`}
          >
            <Wand2 className="w-4 h-4" /> Wand
          </button>
          <button
            onClick={() => ed.setTool({ tool: 'brush' })}
            className={`flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg border transition-colors ${
              tool.tool === 'brush' ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-secondary'
            }`}
          >
            <Brush className="w-4 h-4" /> Brush
          </button>
        </div>

        {/* Mode chips */}
        <div className="space-y-2">
          <div className="flex gap-1.5">
            {modeChip('new', 'New', Sparkles)}
            {modeChip('add', 'Add', Plus)}
            {modeChip('subtract', 'Restore', Minus)}
          </div>
          <p className="text-[11px] text-muted-foreground leading-snug">
            Tip: hold <kbd className="px-1 rounded bg-secondary">Shift</kbd> to add,{' '}
            <kbd className="px-1 rounded bg-secondary">Alt</kbd> to restore. Hold{' '}
            <kbd className="px-1 rounded bg-secondary">Space</kbd> to pan.
          </p>
        </div>

        {tool.tool === 'wand' ? (
          <Section title="Selection" icon={Wand2}>
            <Toggle
              checked={tool.contiguous}
              onChange={(v) => ed.setTool({ contiguous: v })}
              label="Contiguous (this region only)"
            />
            <Slider
              label="Tolerance"
              value={tool.tolerance}
              min={0}
              max={0.6}
              step={0.005}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(v) => {
                ed.setTool({ tolerance: v });
                ed.retuneLast({ tolerance: v });
              }}
            />
            <Slider
              label="Edge softness"
              value={tool.softness}
              min={0}
              max={0.25}
              step={0.005}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(v) => {
                ed.setTool({ softness: v });
                ed.retuneLast({ softness: v });
              }}
            />
            <div className="flex items-center gap-2 pt-1">
              <div className="w-8 h-8 rounded-md border shrink-0" style={{ backgroundColor: rgbToHex(tool.color) }} />
              <span className="text-xs text-muted-foreground font-mono">{rgbToHex(tool.color)}</span>
            </div>
          </Section>
        ) : (
          <Section title="Brush" icon={Brush}>
            <Slider
              label="Size"
              value={tool.brushSize}
              min={4}
              max={200}
              step={1}
              format={(v) => `${v}px`}
              onChange={(v) => ed.setTool({ brushSize: v })}
            />
            <Slider
              label="Hardness"
              value={tool.brushHardness}
              min={0}
              max={1}
              step={0.05}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(v) => ed.setTool({ brushHardness: v })}
            />
            <p className="text-[11px] text-muted-foreground">
              {tool.mode === 'subtract' ? 'Restoring opacity' : 'Erasing to transparent'}. Switch with the mode chips
              above.
            </p>
          </Section>
        )}

        <Section title="Edge quality" icon={Eraser}>
          <Toggle
            checked={ed.settings.decontaminate}
            onChange={(v) => ed.setSettings({ decontaminate: v })}
            label="Remove color fringe (defringe)"
          />
          <Slider
            label="Feather"
            value={ed.settings.featherRadius}
            min={0}
            max={5}
            step={0.5}
            format={(v) => (v === 0 ? 'off' : `${v}px`)}
            onChange={(v) => ed.setSettings({ featherRadius: v })}
          />
          <Toggle
            checked={ed.settings.despeckle}
            onChange={(v) => ed.setSettings({ despeckle: v })}
            label="Clean up speckles"
          />
          <div className="space-y-1.5">
            <span className="text-xs font-medium">Color matching</span>
            <select
              value={ed.settings.metric}
              onChange={(e) => ed.setSettings({ metric: e.target.value as DistanceMetric })}
              className="w-full bg-secondary border-none rounded-lg px-3 py-2 text-sm"
            >
              <option value="weighted">Balanced (recommended)</option>
              <option value="ycbcr">Chroma (ignore brightness)</option>
              <option value="rgb">Strict RGB</option>
            </select>
          </div>
        </Section>

        <Section title="Background fill" icon={Layers}>
          <Toggle
            checked={ed.settings.replaceColor !== null}
            onChange={(v) => ed.setSettings({ replaceColor: v ? hexToRgb('#ffffff') : null })}
            label="Fill transparency with a color"
          />
          {ed.settings.replaceColor && (
            <HexColorPicker
              color={rgbToHex(ed.settings.replaceColor)}
              onChange={(hex) => ed.setSettings({ replaceColor: hexToRgb(hex) })}
              className="!w-full !h-28"
            />
          )}
        </Section>
      </div>

      {/* Canvas + actions */}
      <div className="flex flex-col gap-3 min-h-0">
        <ZoomPanCanvas
          ref={zoomRef}
          imageWidth={ed.imageSize.w}
          imageHeight={ed.imageSize.h}
          className="flex-1 min-h-0"
          panMode={panMode}
          onTogglePan={() => setPanMode((p) => !p)}
          cursor={tool.tool === 'brush' ? 'crosshair' : 'crosshair'}
          onImagePointerDown={onDown}
          onImagePointerMove={onMove}
          onImagePointerUp={onUp}
        >
          <canvas
            ref={ed.bindCanvas}
            width={ed.imageSize.w}
            height={ed.imageSize.h}
            className="absolute top-0 left-0"
            style={{ width: ed.imageSize.w, height: ed.imageSize.h }}
          />
        </ZoomPanCanvas>

        {/* Actions bar */}
        <div className="bg-card border rounded-xl p-3 flex items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-1">
            <button
              onClick={ed.undo}
              disabled={!ed.canUndo}
              className="p-2 rounded-lg hover:bg-secondary disabled:opacity-40 transition-colors"
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              onClick={ed.redo}
              disabled={!ed.canRedo}
              className="p-2 rounded-lg hover:bg-secondary disabled:opacity-40 transition-colors"
              title="Redo (Ctrl+Shift+Z)"
            >
              <Redo2 className="w-4 h-4" />
            </button>
            <button
              onClick={ed.clear}
              disabled={!ed.canUndo}
              className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg hover:bg-secondary disabled:opacity-40 transition-colors"
              title="Clear all edits"
            >
              <RotateCcw className="w-4 h-4" /> Reset
            </button>
            <span className="text-xs text-muted-foreground ml-2">{ed.ops.length} edits</span>
            {ed.busy && <span className="text-xs text-primary animate-pulse ml-1">Processing…</span>}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors"
            >
              <Copy className="w-4 h-4" />
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
            >
              <Download className="w-4 h-4" />
              Download PNG
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
