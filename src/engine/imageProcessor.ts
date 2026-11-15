import type {
  CharRampDefinition,
  DitherAlgorithm,
  PaletteDefinition,
  RenderMode,
  RenderResult,
  RenderSettings,
} from '../types/studio';

// Braille dot bitmasks ordered as [col 0..1][row 0..3]
// Unicode Braille Patterns U+2800..U+28FF:
// (0,0)=0x01, (0,1)=0x02, (0,2)=0x04, (0,3)=0x40
// (1,0)=0x08, (1,1)=0x10, (1,2)=0x20, (1,3)=0x80
const BRAILLE_DOT_BITS = [
  [0x01, 0x08],
  [0x02, 0x10],
  [0x04, 0x20],
  [0x40, 0x80],
] as const;

const BAYER_CACHE = new Map<number, Float32Array>();

function buildBayerMatrix(size: number): Float32Array {
  const cached = BAYER_CACHE.get(size);
  if (cached) return cached;

  let m = new Float32Array([0]);
  let n = 1;
  while (n < size) {
    const next = new Float32Array(n * n * 4);
    const n2 = n * 2;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const v = m[y * n + x] * 4;
        next[y * n2 + x] = v;
        next[y * n2 + (x + n)] = v + 2;
        next[(y + n) * n2 + x] = v + 3;
        next[(y + n) * n2 + (x + n)] = v + 1;
      }
    }
    m = next;
    n = n2;
  }

  const total = size * size;
  const normalized = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    normalized[i] = (m[i] + 0.5) / total - 0.5;
  }
  BAYER_CACHE.set(size, normalized);
  return normalized;
}

function getBayerSize(algo: DitherAlgorithm): number {
  switch (algo) {
    case 'bayer2':
      return 2;
    case 'bayer4':
      return 4;
    case 'bayer8':
      return 8;
    case 'bayer16':
      return 16;
    default:
      return 0;
  }
}

// Deterministic 2D hash in [-0.5, 0.5) for flicker-free stochastic dithering
function stochasticNoise(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return ((h >>> 0) / 4294967296) - 0.5;
}

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16) || 0;
    const g = parseInt(clean[1] + clean[1], 16) || 0;
    const b = parseInt(clean[2] + clean[2], 16) || 0;
    return [r, g, b];
  }
  if (clean.length >= 6) {
    const r = parseInt(clean.slice(0, 2), 16) || 0;
    const g = parseInt(clean.slice(2, 4), 16) || 0;
    const b = parseInt(clean.slice(4, 6), 16) || 0;
    return [r, g, b];
  }
  return [255, 255, 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0')
      .toUpperCase();
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function relativeLuminance(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

// Perceptual redmean RGB distance squared
function findNearestPaletteColor(
  r: number,
  g: number,
  b: number,
  paletteRgb: Uint8Array,
  count: number
): number {
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < count; i++) {
    const o = i * 3;
    const pr = paletteRgb[o];
    const pg = paletteRgb[o + 1];
    const pb = paletteRgb[o + 2];
    const rMean = (r + pr) * 0.5;
    const dr = r - pr;
    const dg = g - pg;
    const db = b - pb;
    const dist =
      ((512 + rMean) * dr * dr) / 256 +
      4 * dg * dg +
      ((767 - rMean) * db * db) / 256;
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  return bestIdx;
}

export function computeTargetDimensions(
  srcW: number,
  srcH: number,
  settings: RenderSettings
): { cols: number; rows: number; sampleW: number; sampleH: number } {
  const safeW = Math.max(1, srcW);
  const safeH = Math.max(1, srcH);
  const aspect = safeH / safeW;

  let cols = Math.max(16, Math.min(320, Math.round(settings.columns)));
  if (settings.nativeOneToOne) {
    if (settings.mode === 'braille') {
      cols = Math.max(16, Math.min(320, Math.ceil(safeW / 2)));
    } else {
      cols = Math.max(16, Math.min(320, safeW));
    }
  }

  let rows: number;
  if (settings.mode === 'pixel') {
    rows = Math.max(1, Math.round(cols * aspect));
    return { cols, rows, sampleW: cols, sampleH: rows };
  }

  if (settings.mode === 'halfblock') {
    rows = Math.max(1, Math.round(cols * aspect * settings.cellAspectRatio));
    return { cols, rows, sampleW: cols, sampleH: rows * 2 };
  }

  if (settings.mode === 'braille') {
    rows = Math.max(1, Math.round(cols * aspect * settings.cellAspectRatio));
    return { cols, rows, sampleW: cols * 2, sampleH: rows * 4 };
  }

  // Standard ASCII / Unicode character grid
  rows = Math.max(1, Math.round(cols * aspect * settings.cellAspectRatio));
  return { cols, rows, sampleW: cols, sampleH: rows };
}

function areaDownsample(
  src: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number
): Float32Array {
  const out = new Float32Array(dstW * dstH * 3);
  const scaleX = srcW / dstW;
  const scaleY = srcH / dstH;

  for (let dy = 0; dy < dstH; dy++) {
    const sy0 = dy * scaleY;
    const sy1 = (dy + 1) * scaleY;
    const yStart = Math.max(0, Math.floor(sy0));
    const yEnd = Math.min(srcH - 1, Math.floor(sy1 - 1e-6));

    for (let dx = 0; dx < dstW; dx++) {
      const sx0 = dx * scaleX;
      const sx1 = (dx + 1) * scaleX;
      const xStart = Math.max(0, Math.floor(sx0));
      const xEnd = Math.min(srcW - 1, Math.floor(sx1 - 1e-6));

      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let count = 0;

      for (let sy = yStart; sy <= yEnd; sy++) {
        const rowOff = sy * srcW;
        for (let sx = xStart; sx <= xEnd; sx++) {
          const idx = (rowOff + sx) * 4;
          const a = src[idx + 3] / 255;
          rSum += src[idx] * a;
          gSum += src[idx + 1] * a;
          bSum += src[idx + 2] * a;
          count++;
        }
      }

      if (count === 0) {
        const sx = Math.min(srcW - 1, Math.floor(sx0));
        const sy = Math.min(srcH - 1, Math.floor(sy0));
        const idx = (sy * srcW + sx) * 4;
        const a = src[idx + 3] / 255;
        rSum = src[idx] * a;
        gSum = src[idx + 1] * a;
        bSum = src[idx + 2] * a;
        count = 1;
      }

      const outIdx = (dy * dstW + dx) * 3;
      out[outIdx] = rSum / count;
      out[outIdx + 1] = gSum / count;
      out[outIdx + 2] = bSum / count;
    }
  }

  return out;
}

function applyBoxBlur(buf: Float32Array, w: number, h: number, radius: number): Float32Array {
  if (radius <= 0) return buf;
  const r = Math.min(6, Math.round(radius));
  const temp = new Float32Array(buf.length);
  const out = new Float32Array(buf.length);

  // Horizontal pass
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let cnt = 0;
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w - 1, x + r);
      for (let kx = x0; kx <= x1; kx++) {
        const i = (y * w + kx) * 3;
        sr += buf[i];
        sg += buf[i + 1];
        sb += buf[i + 2];
        cnt++;
      }
      const o = (y * w + x) * 3;
      temp[o] = sr / cnt;
      temp[o + 1] = sg / cnt;
      temp[o + 2] = sb / cnt;
    }
  }

  // Vertical pass
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h - 1, y + r);
    for (let x = 0; x < w; x++) {
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let cnt = 0;
      for (let ky = y0; ky <= y1; ky++) {
        const i = (ky * w + x) * 3;
        sr += temp[i];
        sg += temp[i + 1];
        sb += temp[i + 2];
        cnt++;
      }
      const o = (y * w + x) * 3;
      out[o] = sr / cnt;
      out[o + 1] = sg / cnt;
      out[o + 2] = sb / cnt;
    }
  }

  return out;
}

function applyEdgeBoost(buf: Float32Array, w: number, h: number, amount: number): Float32Array {
  if (amount <= 0) return buf;
  const strength = (amount / 100) * 1.4;
  const out = new Float32Array(buf.length);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 3;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) {
        out[idx] = buf[idx];
        out[idx + 1] = buf[idx + 1];
        out[idx + 2] = buf[idx + 2];
        continue;
      }
      const top = ((y - 1) * w + x) * 3;
      const bot = ((y + 1) * w + x) * 3;
      const lft = (y * w + (x - 1)) * 3;
      const rgt = (y * w + (x + 1)) * 3;

      for (let c = 0; c < 3; c++) {
        const center = buf[idx + c];
        const avgNeighbors =
          (buf[top + c] + buf[bot + c] + buf[lft + c] + buf[rgt + c]) * 0.25;
        const val = center + (center - avgNeighbors) * strength;
        out[idx + c] = Math.max(0, Math.min(255, val));
      }
    }
  }

  return out;
}

interface ErrorKernel {
  divisor: number;
  offsets: ReadonlyArray<readonly [number, number, number]>; // [dx, dy, weight]
}

const ERROR_KERNELS: Record<string, ErrorKernel> = {
  'floyd-steinberg': {
    divisor: 16,
    offsets: [
      [1, 0, 7],
      [-1, 1, 3],
      [0, 1, 5],
      [1, 1, 1],
    ],
  },
  atkinson: {
    divisor: 8,
    offsets: [
      [1, 0, 1],
      [2, 0, 1],
      [-1, 1, 1],
      [0, 1, 1],
      [1, 1, 1],
      [0, 2, 1],
    ],
  },
  stucki: {
    divisor: 42,
    offsets: [
      [1, 0, 8],
      [2, 0, 4],
      [-2, 1, 2],
      [-1, 1, 4],
      [0, 1, 8],
      [1, 1, 4],
      [2, 1, 2],
      [-2, 2, 1],
      [-1, 2, 2],
      [0, 2, 4],
      [1, 2, 2],
      [2, 2, 1],
    ],
  },
};

function isErrorDiffusion(algo: DitherAlgorithm): boolean {
  return algo === 'floyd-steinberg' || algo === 'atkinson' || algo === 'stucki';
}

export function processImageBuffer(
  srcRgba: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  settings: RenderSettings,
  palette: PaletteDefinition,
  charRamp: CharRampDefinition
): RenderResult {
  const t0 = performance.now();

  const { cols, rows, sampleW, sampleH } = computeTargetDimensions(srcW, srcH, settings);
  let buf = areaDownsample(srcRgba, srcW, srcH, sampleW, sampleH);

  // 1. Simplification: Spatial Blur & Edge Boost
  if (settings.blurRadius > 0) {
    buf = applyBoxBlur(buf, sampleW, sampleH, settings.blurRadius);
  }
  if (settings.edgeBoost > 0) {
    buf = applyEdgeBoost(buf, sampleW, sampleH, settings.edgeBoost);
  }

  // 2. Tone Adjustments: Brightness, Contrast, Gamma, Posterize, Inverse
  const brightOffset = (settings.brightness / 100) * 255;
  const cNorm = (settings.contrast / 100) * 255;
  const contrastFactor = (259 * (cNorm + 255)) / (255 * (259 - cNorm));
  const invGamma = 1 / Math.max(0.2, settings.gamma);
  const posterize = settings.posterizeLevels >= 2 ? settings.posterizeLevels : 0;

  const totalSamples = sampleW * sampleH;
  for (let i = 0; i < totalSamples * 3; i++) {
    let v = buf[i];
    v = v + brightOffset;
    v = contrastFactor * (v - 128) + 128;
    v = Math.max(0, Math.min(255, v));
    v = 255 * Math.pow(v / 255, invGamma);
    if (posterize > 0) {
      const step = 255 / (posterize - 1);
      v = Math.round(v / step) * step;
    }
    if (settings.inverse) {
      v = 255 - v;
    }
    buf[i] = Math.max(0, Math.min(255, v));
  }

  // Prepare palette RGB buffer
  const validColors = palette.colors.length > 0 ? palette.colors : ['#000000', '#FFFFFF'];
  const paletteRgb = new Uint8Array(validColors.length * 3);
  for (let i = 0; i < validColors.length; i++) {
    const [r, g, b] = hexToRgb(validColors[i]);
    paletteRgb[i * 3] = r;
    paletteRgb[i * 3 + 1] = g;
    paletteRgb[i * 3 + 2] = b;
  }

  const monoFg = hexToRgb(settings.monoForeground);
  const monoBg = hexToRgb(settings.backgroundColor);

  // Ordered Bayer or Stochastic offset helper in [-0.5, 0.5]
  const bayerSize = getBayerSize(settings.ditherAlgorithm);
  const bayerMatrix = bayerSize > 0 ? buildBayerMatrix(bayerSize) : null;
  const ditherNorm = settings.ditherStrength / 100;
  const useErrDiff = isErrorDiffusion(settings.ditherAlgorithm) && ditherNorm > 0;
  const errKernel = useErrDiff ? ERROR_KERNELS[settings.ditherAlgorithm] : null;

  const getOrderedBias = (x: number, y: number): number => {
    if (ditherNorm <= 0) return 0;
    if (bayerMatrix) {
      const mx = x % bayerSize;
      const my = y % bayerSize;
      return bayerMatrix[my * bayerSize + mx] * ditherNorm;
    }
    if (settings.ditherAlgorithm === 'stochastic') {
      return stochasticNoise(x, y) * ditherNorm;
    }
    return 0;
  };

  // Quantize a single RGB sample to target color mode (returns [r, g, b, lum01])
  const quantizeColor = (
    r: number,
    g: number,
    b: number,
    bias: number
  ): [number, number, number] => {
    const cr = Math.max(0, Math.min(255, r));
    const cg = Math.max(0, Math.min(255, g));
    const cb = Math.max(0, Math.min(255, b));

    if (settings.colorMode === 'truecolor') {
      if (posterize > 0) {
        const step = 255 / (posterize - 1);
        const qr = Math.max(0, Math.min(255, Math.round((cr + bias * step) / step) * step));
        const qg = Math.max(0, Math.min(255, Math.round((cg + bias * step) / step) * step));
        const qb = Math.max(0, Math.min(255, Math.round((cb + bias * step) / step) * step));
        return [qr, qg, qb];
      }
      return [Math.round(cr), Math.round(cg), Math.round(cb)];
    }

    if (settings.colorMode === 'grayscale') {
      const lum = (0.2126 * cr + 0.7152 * cg + 0.0722 * cb) / 255;
      const levels = posterize >= 2 ? posterize : 16;
      const q = Math.max(0, Math.min(1, Math.round((lum + bias / (levels - 1)) * (levels - 1)) / (levels - 1)));
      const v = Math.round(q * 255);
      return [v, v, v];
    }

    if (settings.colorMode === 'palette') {
      // Spread bias scaled by dynamic range (~96) across channels before palette matching
      const spread = bias * 96;
      const pIdx = findNearestPaletteColor(
        Math.max(0, Math.min(255, cr + spread)),
        Math.max(0, Math.min(255, cg + spread)),
        Math.max(0, Math.min(255, cb + spread)),
        paletteRgb,
        validColors.length
      );
      return [paletteRgb[pIdx * 3], paletteRgb[pIdx * 3 + 1], paletteRgb[pIdx * 3 + 2]];
    }

    // 'mono' mode: 1-bit threshold for pixel/halfblock/braille, or tonal foreground for ASCII
    const lum = (0.2126 * cr + 0.7152 * cg + 0.0722 * cb) / 255;
    const on = lum + bias >= 0.5;
    return on ? [monoFg[0], monoFg[1], monoFg[2]] : [monoBg[0], monoBg[1], monoBg[2]];
  };

  // Run Color Error Diffusion across sample buffer if needed
  // For ASCII mode in mono/grayscale, we dither luminance across the character ramp steps instead
  const charsList = Array.from(charRamp.chars.length > 0 ? charRamp.chars : ' .:-=+*#%@');
  const rampLen = charsList.length;

  // Build quantized RGB sample array (for pixel, halfblock, or palette/truecolor modes)
  const qSampleRgb = new Uint8ClampedArray(totalSamples * 3);
  // Also track dithered scalar luminance [0..1] for ASCII/Braille glyph mapping
  const ditheredLum = new Float32Array(totalSamples);

  if (useErrDiff && errKernel) {
    // Working copies so color diffusion & glyph luminance diffusion don't interfere destructively
    const rgbWork = new Float32Array(buf);
    const lumWork = new Float32Array(totalSamples);
    for (let i = 0; i < totalSamples; i++) {
      lumWork[i] = relativeLuminance(buf[i * 3], buf[i * 3 + 1], buf[i * 3 + 2]);
    }

    for (let y = 0; y < sampleH; y++) {
      const reverse = settings.serpentine && y % 2 === 1;
      for (let stepX = 0; stepX < sampleW; stepX++) {
        const x = reverse ? sampleW - 1 - stepX : stepX;
        const pIdx = y * sampleW + x;
        const rgbIdx = pIdx * 3;

        // 1) Color Error Diffusion
        const oldR = rgbWork[rgbIdx];
        const oldG = rgbWork[rgbIdx + 1];
        const oldB = rgbWork[rgbIdx + 2];
        const [newR, newG, newB] = quantizeColor(oldR, oldG, oldB, 0);

        qSampleRgb[rgbIdx] = newR;
        qSampleRgb[rgbIdx + 1] = newG;
        qSampleRgb[rgbIdx + 2] = newB;

        const errR = (oldR - newR) * ditherNorm;
        const errG = (oldG - newG) * ditherNorm;
        const errB = (oldB - newB) * ditherNorm;

        // 2) Scalar Luminance Error Diffusion (for ASCII ramp & Braille 1-bit dots)
        const oldLum = Math.max(0, Math.min(1, lumWork[pIdx]));
        const glyphSteps = settings.mode === 'braille' ? 2 : Math.max(2, rampLen);
        const qLum = Math.round(oldLum * (glyphSteps - 1)) / (glyphSteps - 1);
        ditheredLum[pIdx] = qLum;
        const errLum = (oldLum - qLum) * ditherNorm;

        for (let k = 0; k < errKernel.offsets.length; k++) {
          const [dxRaw, dy, w] = errKernel.offsets[k];
          const dx = reverse ? -dxRaw : dxRaw;
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < sampleW && ny >= 0 && ny < sampleH) {
            const factor = w / errKernel.divisor;
            const nIdx = ny * sampleW + nx;
            const nRgb = nIdx * 3;
            rgbWork[nRgb] += errR * factor;
            rgbWork[nRgb + 1] += errG * factor;
            rgbWork[nRgb + 2] += errB * factor;
            lumWork[nIdx] += errLum * factor;
          }
        }
      }
    }
  } else {
    // Ordered Bayer / Stochastic / None
    for (let y = 0; y < sampleH; y++) {
      for (let x = 0; x < sampleW; x++) {
        const pIdx = y * sampleW + x;
        const rgbIdx = pIdx * 3;
        const bias = getOrderedBias(x, y);
        const r = buf[rgbIdx];
        const g = buf[rgbIdx + 1];
        const b = buf[rgbIdx + 2];

        const [nr, ng, nb] = quantizeColor(r, g, b, bias);
        qSampleRgb[rgbIdx] = nr;
        qSampleRgb[rgbIdx + 1] = ng;
        qSampleRgb[rgbIdx + 2] = nb;

        const lum = relativeLuminance(r, g, b);
        if (settings.mode === 'braille') {
          ditheredLum[pIdx] = lum + bias >= 0.5 ? 1 : 0;
        } else {
          const steps = Math.max(2, rampLen);
          const q = Math.round(Math.max(0, Math.min(1, lum + bias / (steps - 1))) * (steps - 1)) / (steps - 1);
          ditheredLum[pIdx] = q;
        }
      }
    }
  }

  // Pack final cell matrix (cols × rows)
  const cellCount = cols * rows;
  const codepoints = new Uint32Array(cellCount);
  const fgRgba = new Uint8ClampedArray(cellCount * 4);
  const bgRgba = new Uint8ClampedArray(cellCount * 4);

  if (settings.mode === 'pixel') {
    const blockCp = 0x2588; // '█'
    for (let i = 0; i < cellCount; i++) {
      codepoints[i] = blockCp;
      const s = i * 3;
      const c = i * 4;
      fgRgba[c] = qSampleRgb[s];
      fgRgba[c + 1] = qSampleRgb[s + 1];
      fgRgba[c + 2] = qSampleRgb[s + 2];
      fgRgba[c + 3] = 255;

      bgRgba[c] = qSampleRgb[s];
      bgRgba[c + 1] = qSampleRgb[s + 1];
      bgRgba[c + 2] = qSampleRgb[s + 2];
      bgRgba[c + 3] = 255;
    }
  } else if (settings.mode === 'halfblock') {
    const halfCp = 0x2580; // '▀'
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const cellIdx = y * cols + x;
        const topSample = ((y * 2) * sampleW + x) * 3;
        const botSample = ((y * 2 + 1) * sampleW + x) * 3;
        const c = cellIdx * 4;

        codepoints[cellIdx] = halfCp;
        fgRgba[c] = qSampleRgb[topSample];
        fgRgba[c + 1] = qSampleRgb[topSample + 1];
        fgRgba[c + 2] = qSampleRgb[topSample + 2];
        fgRgba[c + 3] = 255;

        bgRgba[c] = qSampleRgb[botSample];
        bgRgba[c + 1] = qSampleRgb[botSample + 1];
        bgRgba[c + 2] = qSampleRgb[botSample + 2];
        bgRgba[c + 3] = 255;
      }
    }
  } else if (settings.mode === 'braille') {
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const cellIdx = y * cols + x;
        let mask = 0;
        let rSum = 0;
        let gSum = 0;
        let bSum = 0;
        let litCount = 0;

        for (let dy = 0; dy < 4; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            const sx = x * 2 + dx;
            const sy = y * 4 + dy;
            const sIdx = sy * sampleW + sx;
            if (ditheredLum[sIdx] >= 0.5) {
              mask |= BRAILLE_DOT_BITS[dy][dx];
              const rgbOff = sIdx * 3;
              rSum += qSampleRgb[rgbOff];
              gSum += qSampleRgb[rgbOff + 1];
              bSum += qSampleRgb[rgbOff + 2];
              litCount++;
            }
          }
        }

        codepoints[cellIdx] = 0x2800 + mask;
        const c = cellIdx * 4;
        if (settings.colorMode === 'mono') {
          fgRgba[c] = monoFg[0];
          fgRgba[c + 1] = monoFg[1];
          fgRgba[c + 2] = monoFg[2];
        } else if (litCount > 0) {
          fgRgba[c] = Math.round(rSum / litCount);
          fgRgba[c + 1] = Math.round(gSum / litCount);
          fgRgba[c + 2] = Math.round(bSum / litCount);
        } else {
          const fallback = ((y * 4) * sampleW + x * 2) * 3;
          fgRgba[c] = qSampleRgb[fallback];
          fgRgba[c + 1] = qSampleRgb[fallback + 1];
          fgRgba[c + 2] = qSampleRgb[fallback + 2];
        }
        fgRgba[c + 3] = 255;

        bgRgba[c] = monoBg[0];
        bgRgba[c + 1] = monoBg[1];
        bgRgba[c + 2] = monoBg[2];
        bgRgba[c + 3] = 255;
      }
    }
  } else {
    // 'ascii' / Unicode character mode
    for (let i = 0; i < cellCount; i++) {
      const lum = Math.max(0, Math.min(1, ditheredLum[i]));
      const rampIdx = Math.min(rampLen - 1, Math.max(0, Math.round(lum * (rampLen - 1))));
      const ch = charsList[rampIdx];
      codepoints[i] = ch.codePointAt(0) ?? 32;

      const c = i * 4;
      const s = i * 3;
      if (settings.colorMode === 'mono') {
        fgRgba[c] = monoFg[0];
        fgRgba[c + 1] = monoFg[1];
        fgRgba[c + 2] = monoFg[2];
      } else {
        fgRgba[c] = qSampleRgb[s];
        fgRgba[c + 1] = qSampleRgb[s + 1];
        fgRgba[c + 2] = qSampleRgb[s + 2];
      }
      fgRgba[c + 3] = 255;

      bgRgba[c] = monoBg[0];
      bgRgba[c + 1] = monoBg[1];
      bgRgba[c + 2] = monoBg[2];
      bgRgba[c + 3] = 255;
    }
  }

  return {
    cols,
    rows,
    mode: settings.mode,
    codepoints,
    fgRgba,
    bgRgba,
    renderTimeMs: Math.round((performance.now() - t0) * 10) / 10,
  };
}
