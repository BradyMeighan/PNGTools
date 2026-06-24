import { useRef, useState } from 'react';
import { HexColorPicker } from 'react-colorful';
import {
  Download,
  Copy,
  RotateCcw,
  Undo2,
  Redo2,
  Wand2,
  Paintbrush,
  Eraser,
  Eye,
  MousePointerClick,
  Sparkles,
  Layers,
  X,
} from 'lucide-react';
import { ImageUploader } from '../ImageUploader';
import { ZoomPanCanvas, type ImagePoint, type ZoomPanHandle } from '../ZoomPanCanvas';
import { Tooltip, InfoTip } from '../Tooltip';
import { useTransparencyEditor, type Action } from '../../hooks/useTransparencyEditor';
import { rgbToHex, hexToRgb } from '../../lib/transparency/color';
import type { DistanceMetric } from '../../lib/transparency/types';

function Section({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 pb-1.5 border-b text-sm font-semibold">{title}</div>
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
  info,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  info?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center text-xs">
        <span className="font-medium flex items-center gap-1.5">
          {label}
          {info && <InfoTip text={info} />}
        </span>
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

function Toggle({
  checked,
  onChange,
  label,
  info,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  info?: string;
}) {
  return (
    <label className="flex items-center gap-3 p-2.5 rounded-lg border bg-secondary/20 cursor-pointer hover:bg-secondary/30 transition-colors">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 rounded border-primary text-primary focus:ring-primary"
      />
      <span className="text-sm font-medium flex items-center gap-1.5 flex-1">
        {label}
        {info && <InfoTip text={info} />}
      </span>
    </label>
  );
}

export function TransparencyTool() {
  const ed = useTransparencyEditor();
  const zoomRef = useRef<ZoomPanHandle>(null);
  const drawing = useRef(false);
  const [panMode, setPanMode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showHint, setShowHint] = useState(true);

  const actionFor = (e: React.PointerEvent): Action =>
    e.altKey ? 'restore' : ed.tool.action;

  const onDown = (pt: ImagePoint, e: React.PointerEvent) => {
    if (ed.tool.tool === 'brush') {
      drawing.current = true;
      ed.beginStroke(pt, actionFor(e));
    } else {
      ed.wandAt(pt, actionFor(e));
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

  const handleReset = () => {
    if (ed.canUndo && !window.confirm('Reset to the automatic background removal? Your manual edits will be cleared.'))
      return;
    ed.reset();
  };

  if (!ed.imageSize) {
    return (
      <div className="max-w-2xl mx-auto mt-10">
        <div className="text-center mb-10 space-y-4">
          <h2 className="text-4xl font-bold tracking-tight bg-gradient-to-br from-white to-white/60 bg-clip-text text-transparent">
            Remove Backgrounds, Automatically
          </h2>
          <p className="text-muted-foreground text-lg">
            Drop in an image and the background disappears on its own. Touch up anything left over
            with one click. Runs entirely in your browser.
          </p>
        </div>
        <ImageUploader onImageSelect={ed.loadFile} />
      </div>
    );
  }

  const { tool } = ed;

  const segBtn = (active: boolean, onClick: () => void, icon: React.ElementType, label: string, tip: string) => {
    const Icon = icon;
    return (
      <Tooltip text={tip}>
        <button
          onClick={onClick}
          className={`flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium rounded-lg border transition-colors w-full ${
            active ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-secondary'
          }`}
        >
          <Icon className="w-4 h-4" /> {label}
        </button>
      </Tooltip>
    );
  };

  return (
    <div className="grid lg:grid-cols-[330px_1fr] gap-6 h-[calc(100vh-12rem)]">
      {/* Sidebar */}
      <div className="space-y-5 p-5 bg-card rounded-xl border shadow-sm overflow-y-auto max-h-[calc(100vh-12rem)]">
        {/* Auto */}
        <div className="space-y-2">
          <Tooltip text="Detect the background color and remove it again. Best for solid or simple backgrounds.">
            <button
              onClick={ed.autoRemove}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
            >
              <Sparkles className="w-4 h-4" /> Auto-remove background
            </button>
          </Tooltip>
          <Tooltip text="Uses AI to cut out the main subject. Best for photos of people or products on busy backgrounds. Downloads a small model the first time.">
            <button
              onClick={ed.runAiCutout}
              disabled={ed.aiBusy}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 border rounded-lg text-sm font-medium hover:bg-secondary transition-colors disabled:opacity-60"
            >
              {ed.aiBusy ? (
                <>
                  <span className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  {ed.aiProgress?.label ?? 'Working…'}
                </>
              ) : (
                <>
                  <Wand2 className="w-4 h-4 text-primary" /> Remove background (AI)
                </>
              )}
            </button>
          </Tooltip>
          {ed.aiError && <p className="text-[11px] text-destructive leading-snug">{ed.aiError}</p>}
        </div>

        {/* What do you want to do */}
        <div className="space-y-2">
          <span className="text-xs font-medium text-muted-foreground">What do you want to do?</span>
          <div className="grid grid-cols-2 gap-2">
            {segBtn(tool.action === 'erase', () => ed.setTool({ action: 'erase' }), Eraser, 'Erase', 'Click parts of the image you want to make transparent.')}
            {segBtn(tool.action === 'restore', () => ed.setTool({ action: 'restore' }), Eye, 'Restore', 'Bring parts back that were removed by mistake.')}
          </div>
          <p className="text-[11px] text-muted-foreground leading-snug">
            {tool.action === 'erase'
              ? 'Click anything you want gone. Hold Alt to temporarily restore.'
              : 'Click to bring removed areas back.'}
          </p>
        </div>

        {/* How to apply */}
        <div className="space-y-2">
          <span className="text-xs font-medium text-muted-foreground">How?</span>
          <div className="grid grid-cols-2 gap-2">
            {segBtn(tool.tool === 'wand', () => ed.setTool({ tool: 'wand' }), MousePointerClick, 'Click color', 'Click once to affect a whole area of similar color. Best for solid backgrounds.')}
            {segBtn(tool.tool === 'brush', () => ed.setTool({ tool: 'brush' }), Paintbrush, 'Paint', 'Drag to paint by hand. Best for fine touch-ups.')}
          </div>
        </div>

        {tool.tool === 'wand' ? (
          <Section title={<><Wand2 className="w-4 h-4 text-primary" /> Click settings</>}>
            <Toggle
              checked={tool.contiguous}
              onChange={(v) => ed.setTool({ contiguous: v })}
              label="Only connected areas"
              info="On: affects just the patch you click (so removing the outside leaves the white inside an O alone). Off: affects that color everywhere in the image."
            />
            <Slider
              label="Sensitivity"
              value={tool.tolerance}
              min={0.01}
              max={0.6}
              step={0.005}
              format={(v) => `${Math.round(v * 100)}%`}
              info="How far from the clicked color to include. Higher grabs more shades; lower is pickier. Drag this right after a click to fine-tune it."
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
              info="Softens the cut edge so it blends smoothly instead of looking jagged."
              onChange={(v) => {
                ed.setTool({ softness: v });
                ed.retuneLast({ softness: v });
              }}
            />
            <div className="flex items-center gap-2 pt-1">
              <span className="text-xs text-muted-foreground">Last picked color</span>
              <div className="w-6 h-6 rounded-md border shrink-0" style={{ backgroundColor: rgbToHex(tool.color) }} />
              <span className="text-xs text-muted-foreground font-mono">{rgbToHex(tool.color)}</span>
            </div>
          </Section>
        ) : (
          <Section title={<><Paintbrush className="w-4 h-4 text-primary" /> Brush settings</>}>
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
              info="Higher gives a crisp edge, lower gives a feathered, soft-edged brush."
              onChange={(v) => ed.setTool({ brushHardness: v })}
            />
          </Section>
        )}

        <Section title={<><Eraser className="w-4 h-4 text-primary" /> Edge quality</>}>
          <Toggle
            checked={ed.settings.decontaminate}
            onChange={(v) => ed.setSettings({ decontaminate: v })}
            label="Remove color fringe"
            info="Cleans the leftover colored halo (like a faint white outline) from the edges. Recommended on."
          />
          <Slider
            label="Feather"
            value={ed.settings.featherRadius}
            min={0}
            max={5}
            step={0.5}
            format={(v) => (v === 0 ? 'off' : `${v}px`)}
            info="Extra global softening of all edges. Leave off unless edges look harsh."
            onChange={(v) => ed.setSettings({ featherRadius: v })}
          />
          <Toggle
            checked={ed.settings.despeckle}
            onChange={(v) => ed.setSettings({ despeckle: v })}
            label="Clean up speckles"
            info="Removes tiny stray dots left behind in the transparent area."
          />
          <div className="space-y-1.5">
            <span className="text-xs font-medium flex items-center gap-1.5">
              Color matching <InfoTip text="Balanced works for most images. Chroma ignores brightness (good when the subject has shadows). Strict is exact RGB." />
            </span>
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

        <Section title={<><Layers className="w-4 h-4 text-primary" /> Background fill</>}>
          <Toggle
            checked={ed.settings.replaceColor !== null}
            onChange={(v) => ed.setSettings({ replaceColor: v ? hexToRgb('#ffffff') : null })}
            label="Fill with a solid color"
            info="Instead of transparency, put a solid color behind the subject."
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
        <div className="relative flex-1 min-h-0">
          <ZoomPanCanvas
            ref={zoomRef}
            imageWidth={ed.imageSize.w}
            imageHeight={ed.imageSize.h}
            className="absolute inset-0"
            panMode={panMode}
            onTogglePan={() => setPanMode((p) => !p)}
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

          {showHint && (
            <div className="absolute top-3 left-3 right-3 flex items-start gap-3 bg-card/95 backdrop-blur border rounded-lg px-4 py-3 shadow-lg max-w-xl">
              <Sparkles className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <p className="text-sm text-muted-foreground leading-snug flex-1">
                Background removed automatically. Click any leftover bits to erase them, switch to{' '}
                <span className="text-foreground font-medium">Restore</span> to bring parts back, and press{' '}
                <kbd className="px-1 rounded bg-secondary text-xs">Ctrl+Z</kbd> to undo. You can never lose your work.
              </p>
              <button onClick={() => setShowHint(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Actions bar */}
        <div className="bg-card border rounded-xl p-3 flex items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-1">
            <Tooltip text="Undo (Ctrl+Z)" side="top">
              <button onClick={ed.undo} disabled={!ed.canUndo} className="p-2 rounded-lg hover:bg-secondary disabled:opacity-40 transition-colors">
                <Undo2 className="w-4 h-4" />
              </button>
            </Tooltip>
            <Tooltip text="Redo (Ctrl+Shift+Z)" side="top">
              <button onClick={ed.redo} disabled={!ed.canRedo} className="p-2 rounded-lg hover:bg-secondary disabled:opacity-40 transition-colors">
                <Redo2 className="w-4 h-4" />
              </button>
            </Tooltip>
            <Tooltip text="Clear manual edits and revert to the automatic background removal" side="top">
              <button onClick={handleReset} className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg hover:bg-secondary transition-colors">
                <RotateCcw className="w-4 h-4" /> Reset
              </button>
            </Tooltip>
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
