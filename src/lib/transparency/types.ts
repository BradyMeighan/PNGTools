import type { RGB, DistanceMetric } from './color';

// How a new selection combines with the accumulated mask.
//  - 'new'      : discard everything before this op, start fresh
//  - 'add'      : remove more (union into the transparent area)
//  - 'subtract' : restore / paint opacity back (remove from the transparent area)
export type SelectionMode = 'new' | 'add' | 'subtract';

export type OpKind = 'global' | 'flood' | 'brush' | 'ai';

export interface BrushPoint {
  x: number;
  y: number;
}

// One reversible removal action. The full mask is reconstructed by folding the
// ordered list of ops, which is what powers undo/redo without snapshots.
export interface RemovalOp {
  id: string;
  kind: OpKind;
  mode: SelectionMode;
  // Color keying (global / flood).
  color?: RGB;
  tolerance: number; // 0..1 normalized inner radius
  softness: number; // 0..1 width of the anti-aliased band
  contiguous?: boolean; // flood (true) vs global (false); informational
  fromEdges?: boolean; // flood inward from all borders (auto-remove)
  seedX?: number;
  seedY?: number;
  // Brush (manual erase / restore).
  stroke?: BrushPoint[];
  radius?: number; // px in image space
  hardness?: number; // 0..1, higher = harder edge
  // AI cutout.
  aiMask?: Uint8Array; // per-pixel removal strength 0..255 (255 = background)
}

export interface RenderSettings {
  metric: DistanceMetric;
  decontaminate: boolean; // un-mix the background color out of edge pixels
  featherRadius: number; // px, 0 = off
  despeckle: boolean;
  replaceColor: RGB | null; // fill transparency with a solid color instead
}

export const DEFAULT_RENDER_SETTINGS: RenderSettings = {
  metric: 'weighted',
  decontaminate: true,
  featherRadius: 0,
  despeckle: false,
  replaceColor: null,
};

export type { RGB, DistanceMetric };
