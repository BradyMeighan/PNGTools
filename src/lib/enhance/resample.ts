import Pica from 'pica';

// High-quality Lanczos resampling with an unsharp-mask pass. This is the reliable
// always-works upscaler/downscaler: no model downloads, no WebGL texture limits,
// great for logos and web imagery. AI upscaling layers on top of this as an option.
const pica = Pica();

export type OutputFormat = 'image/png' | 'image/webp' | 'image/jpeg';

export interface ResampleOptions {
  targetWidth: number;
  targetHeight: number;
  sharpen: number; // 0..2, mapped to pica unsharpAmount
  format: OutputFormat;
  quality?: number; // for webp/jpeg, 0..1
}

function toCanvas(src: HTMLImageElement | HTMLCanvasElement): HTMLCanvasElement {
  if (src instanceof HTMLCanvasElement) return src;
  const w = src.naturalWidth || src.width;
  const h = src.naturalHeight || src.height;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d')!.drawImage(src, 0, 0);
  return c;
}

export async function resampleImage(
  src: HTMLImageElement | HTMLCanvasElement,
  opts: ResampleOptions,
): Promise<Blob> {
  const from = toCanvas(src);
  const to = document.createElement('canvas');
  to.width = Math.max(1, Math.round(opts.targetWidth));
  to.height = Math.max(1, Math.round(opts.targetHeight));

  await pica.resize(from, to, {
    filter: 'lanczos3',
    unsharpAmount: Math.round(Math.max(0, Math.min(2, opts.sharpen)) * 100),
    unsharpRadius: 0.8,
    unsharpThreshold: 2,
  });

  return pica.toBlob(to, opts.format, opts.quality ?? 0.92);
}

export function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
