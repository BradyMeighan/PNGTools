import heic2any from 'heic2any';

export interface OutputFormat {
  mime: string;
  label: string;
  ext: string;
  lossy: boolean;
  alpha: boolean; // whether the format preserves transparency
}

// All formats we might offer. Which ones actually work is detected at runtime,
// because canvas.toBlob silently falls back to PNG for unsupported types.
const CANDIDATES: OutputFormat[] = [
  { mime: 'image/png', label: 'PNG', ext: 'png', lossy: false, alpha: true },
  { mime: 'image/webp', label: 'WebP', ext: 'webp', lossy: true, alpha: true },
  { mime: 'image/jpeg', label: 'JPEG', ext: 'jpg', lossy: true, alpha: false },
  { mime: 'image/avif', label: 'AVIF', ext: 'avif', lossy: true, alpha: true },
];

let cached: OutputFormat[] | null = null;

// Probe the browser by actually encoding a tiny canvas and checking the result
// type. Only formats that truly round-trip are returned, so the UI never offers
// something that would quietly produce a PNG with the wrong extension.
export async function getSupportedOutputFormats(): Promise<OutputFormat[]> {
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 2;
  const supported: OutputFormat[] = [];
  for (const f of CANDIDATES) {
    if (f.mime === 'image/png') {
      supported.push(f);
      continue;
    }
    const ok = await new Promise<boolean>((resolve) =>
      canvas.toBlob((b) => resolve(!!b && b.type === f.mime), f.mime, 0.9),
    );
    if (ok) supported.push(f);
  }
  cached = supported;
  return supported;
}

function loadImageEl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode image'));
    img.src = url;
  });
}

interface Decoded {
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
}

// Robust decode that handles HEIC (via heic2any), SVG (via an <img>, with a
// sensible default size), and falls back from createImageBitmap to an <img>
// element for anything the bitmap decoder chokes on.
async function decode(file: File): Promise<Decoded> {
  let blob: Blob = file;

  const isHeic =
    file.type === 'image/heic' || file.type === 'image/heif' || /\.(heic|heif)$/i.test(file.name);
  if (isHeic) {
    const res = await heic2any({ blob: file, toType: 'image/png' });
    blob = Array.isArray(res) ? res[0] : res;
  }

  const isSvg = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name);
  if (isSvg) {
    const url = URL.createObjectURL(blob);
    const img = await loadImageEl(url);
    // SVGs may not report intrinsic pixels; fall back to a crisp default.
    const width = img.naturalWidth || 1024;
    const height = img.naturalHeight || 1024;
    return { source: img, width, height, cleanup: () => URL.revokeObjectURL(url) };
  }

  try {
    const bmp = await createImageBitmap(blob);
    return { source: bmp, width: bmp.width, height: bmp.height, cleanup: () => bmp.close() };
  } catch {
    const url = URL.createObjectURL(blob);
    const img = await loadImageEl(url);
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      cleanup: () => URL.revokeObjectURL(url),
    };
  }
}

export interface ConvertOptions {
  format: OutputFormat;
  quality: number;
  matte: string; // background color used when the target format has no alpha
}

export async function convertImage(
  file: File,
  opts: ConvertOptions,
): Promise<{ blob: Blob; name: string }> {
  const { source, width, height, cleanup } = await decode(file);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is unavailable');

    // For formats without transparency (JPEG), fill a background first so
    // transparent areas do not turn black, which is the classic conversion bug.
    if (!opts.format.alpha) {
      ctx.fillStyle = opts.matte || '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, opts.format.mime, opts.format.lossy ? opts.quality : undefined),
    );
    if (!blob) throw new Error(`Your browser can't export ${opts.format.label}.`);
    if (blob.type !== opts.format.mime) {
      throw new Error(`Your browser fell back from ${opts.format.label}. Try a different format.`);
    }

    const name = file.name.replace(/\.[^.]+$/, '') + '.' + opts.format.ext;
    return { blob, name };
  } finally {
    cleanup();
  }
}

// File types we accept as input (the picker filter).
export const CONVERT_ACCEPT =
  'image/*,.heic,.heif,.svg,.avif,.bmp,.gif,.tiff,.tif';
