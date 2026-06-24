// Color helpers and perceptual-ish distance metrics for background keying.
// Keying cares about hue more than brightness, so the weighted/ycbcr metrics
// down-weight luma. All distances are returned normalized to roughly [0, 1].

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export type DistanceMetric = 'rgb' | 'weighted' | 'ycbcr';

export function hexToRgb(hex: string): RGB {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : { r: 0, g: 0, b: 0 };
}

export function rgbToHex({ r, g, b }: RGB): string {
  return (
    '#' +
    [r, g, b]
      .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
      .join('')
  );
}

// Maximum possible distance for each metric, used to normalize tolerance to [0,1].
const MAX_RGB = Math.sqrt(3 * 255 * 255);
const MAX_WEIGHTED = Math.sqrt((2 + 4 + 3) * 255 * 255);
// YCbCr chroma-only max (Cb, Cr each span about [-128, 128]).
const MAX_YCBCR = Math.sqrt(2 * 256 * 256);

// Squared distance variants are used in the hot loop to avoid sqrt where possible,
// but we keep the normalized scalar distance API for clarity at call sites.
export function colorDistance(
  r1: number,
  g1: number,
  b1: number,
  r2: number,
  g2: number,
  b2: number,
  metric: DistanceMetric,
): number {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;

  switch (metric) {
    case 'weighted':
      // Common "low-cost approximation" weights, biased toward green/red.
      return Math.sqrt(2 * dr * dr + 4 * dg * dg + 3 * db * db) / MAX_WEIGHTED;
    case 'ycbcr': {
      // Compare chroma channels only so shadows/highlights of the subject are kept.
      const cb1 = -0.168736 * r1 - 0.331264 * g1 + 0.5 * b1;
      const cr1 = 0.5 * r1 - 0.418688 * g1 - 0.081312 * b1;
      const cb2 = -0.168736 * r2 - 0.331264 * g2 + 0.5 * b2;
      const cr2 = 0.5 * r2 - 0.418688 * g2 - 0.081312 * b2;
      const dcb = cb1 - cb2;
      const dcr = cr1 - cr2;
      return Math.sqrt(dcb * dcb + dcr * dcr) / MAX_YCBCR;
    }
    case 'rgb':
    default:
      return Math.sqrt(dr * dr + dg * dg + db * db) / MAX_RGB;
  }
}

// Smoothstep: a continuous S-curve over [0,1]. This is what turns a hard,
// 9-level edge into a smooth anti-aliased ramp with hundreds of alpha levels.
export function smoothstep01(x: number): number {
  const u = x < 0 ? 0 : x > 1 ? 1 : x;
  return u * u * (3 - 2 * u);
}
