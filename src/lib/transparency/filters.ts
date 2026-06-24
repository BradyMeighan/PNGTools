// Single-channel (alpha/coverage) filters used to clean and soften the matte.
// Everything here operates on a Float32Array coverage buffer in [0,1] so we keep
// sub-byte precision until the very end (quantizing early causes visible banding).

// Separable Gaussian blur applied to the coverage channel ONLY. Blurring RGB
// together with alpha is what reintroduces color halos, so we never do that.
export function gaussianBlurCoverage(
  cov: Float32Array,
  width: number,
  height: number,
  radius: number,
): Float32Array {
  if (radius <= 0) return cov;
  const sigma = radius / 2 || 0.5;
  const r = Math.ceil(radius);
  const kernel = new Float32Array(r * 2 + 1);
  let sum = 0;
  for (let k = -r; k <= r; k++) {
    const w = Math.exp(-(k * k) / (2 * sigma * sigma));
    kernel[k + r] = w;
    sum += w;
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= sum;

  const tmp = new Float32Array(cov.length);
  const out = new Float32Array(cov.length);

  // Horizontal pass.
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) {
        let xx = x + k;
        if (xx < 0) xx = 0;
        else if (xx >= width) xx = width - 1;
        acc += cov[row + xx] * kernel[k + r];
      }
      tmp[row + x] = acc;
    }
  }
  // Vertical pass.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) {
        let yy = y + k;
        if (yy < 0) yy = 0;
        else if (yy >= height) yy = height - 1;
        acc += tmp[yy * width + x] * kernel[k + r];
      }
      out[y * width + x] = acc;
    }
  }
  return out;
}

// 3x3 morphological pass. op 'min' = erode (shrinks opaque regions, drops stray
// opaque specks), op 'max' = dilate (grows them, seals pinholes).
function morph(
  cov: Float32Array,
  width: number,
  height: number,
  op: 'min' | 'max',
): Float32Array {
  const out = new Float32Array(cov.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let v = op === 'min' ? 1 : 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          const s = cov[yy * width + xx];
          v = op === 'min' ? Math.min(v, s) : Math.max(v, s);
        }
      }
      out[y * width + x] = v;
    }
  }
  return out;
}

// Open (erode then dilate) removes isolated specks; close (dilate then erode)
// seals small holes. Running open then close gives a gentle de-speckle that
// keeps genuine edges roughly in place.
export function despeckleCoverage(
  cov: Float32Array,
  width: number,
  height: number,
): Float32Array {
  let r = morph(cov, width, height, 'min'); // erode
  r = morph(r, width, height, 'max'); // dilate  -> open
  r = morph(r, width, height, 'max'); // dilate
  r = morph(r, width, height, 'min'); // erode   -> close
  return r;
}
