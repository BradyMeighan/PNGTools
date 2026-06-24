export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// "Crop to edges": find the bounding box of the actual content by trimming a
// uniform border. Works for solid-color borders (detected from the corners) and
// for transparent borders. Returns the full image if there is nothing to trim.
export function detectContentBounds(img: HTMLImageElement, tolerance = 0.06): Rect {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const c = document.createElement('canvas');
  c.width = iw;
  c.height = ih;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, iw, ih).data;

  // Average the four corners to estimate the border color.
  const corners = [0, iw - 1, (ih - 1) * iw, ih * iw - 1].map((i) => i * 4);
  let br = 0;
  let bg = 0;
  let bb = 0;
  let ba = 0;
  for (const p of corners) {
    br += data[p];
    bg += data[p + 1];
    bb += data[p + 2];
    ba += data[p + 3];
  }
  br /= 4;
  bg /= 4;
  bb /= 4;
  ba /= 4;

  const transparentBorder = ba < 10;
  const tol = tolerance * 441.67; // max RGB distance is ~441.67

  let minX = iw;
  let minY = ih;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < ih; y++) {
    for (let x = 0; x < iw; x++) {
      const p = (y * iw + x) * 4;
      const a = data[p + 3];
      let isContent: boolean;
      if (transparentBorder) {
        isContent = a > 16;
      } else {
        const d = Math.sqrt((data[p] - br) ** 2 + (data[p + 1] - bg) ** 2 + (data[p + 2] - bb) ** 2);
        isContent = a > 16 && d > tol;
      }
      if (isContent) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0) return { x: 0, y: 0, w: iw, h: ih };
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}
