import type { RenderSettings } from '../types/studio';

export interface LocalStyleRecommendation {
  summary: string;
  settings: Partial<RenderSettings>;
}

interface ImageStats {
  meanLum: number;
  p5: number;
  p95: number;
  dynamicRange: number;
  meanSaturation: number;
  edgeDensity: number;
}

function analyzeImagePixels(rgba: Uint8ClampedArray, width: number, height: number): ImageStats {
  const hist = new Uint32Array(256);
  const step = Math.max(1, Math.floor((width * height) / 12000));
  let count = 0;
  let lumSum = 0;
  let satSum = 0;
  let edgeSum = 0;

  for (let y = 0; y < height; y += Math.max(1, Math.round(Math.sqrt(step)))) {
    for (let x = 0; x < width; x += Math.max(1, Math.round(Math.sqrt(step)))) {
      const idx = (y * width + x) * 4;
      const r = rgba[idx];
      const g = rgba[idx + 1];
      const b = rgba[idx + 2];
      const lum = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
      hist[Math.max(0, Math.min(255, lum))]++;
      lumSum += lum;

      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      satSum += maxC > 0 ? (maxC - minC) / maxC : 0;

      if (x + 1 < width && y + 1 < height) {
        const rightIdx = (y * width + (x + 1)) * 4;
        const downIdx = ((y + 1) * width + x) * 4;
        const lumR = 0.2126 * rgba[rightIdx] + 0.7152 * rgba[rightIdx + 1] + 0.0722 * rgba[rightIdx + 2];
        const lumD = 0.2126 * rgba[downIdx] + 0.7152 * rgba[downIdx + 1] + 0.0722 * rgba[downIdx + 2];
        edgeSum += Math.abs(lum - lumR) + Math.abs(lum - lumD);
      }
      count++;
    }
  }

  const safeCount = Math.max(1, count);
  const target5 = safeCount * 0.05;
  const target95 = safeCount * 0.95;
  let acc = 0;
  let p5 = 0;
  let p95 = 255;
  for (let i = 0; i < 256; i++) {
    acc += hist[i];
    if (acc >= target5 && p5 === 0) p5 = i;
    if (acc >= target95) {
      p95 = i;
      break;
    }
  }

  return {
    meanLum: lumSum / safeCount,
    p5,
    p95,
    dynamicRange: Math.max(1, p95 - p5),
    meanSaturation: satSum / safeCount,
    edgeDensity: edgeSum / (safeCount * 2),
  };
}

export function computeLocalAutoTune(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  goalPrompt?: string
): LocalStyleRecommendation {
  const stats = analyzeImagePixels(rgba, width, height);
  const goal = (goalPrompt ?? '').toLowerCase();

  // Compute adaptive tone corrections from histogram
  const flatContrastBoost = stats.dynamicRange < 140 ? Math.min(36, Math.round((160 - stats.dynamicRange) * 0.35)) : 8;
  const brightnessOffset = stats.meanLum < 75 ? 12 : stats.meanLum > 190 ? -12 : 0;
  const gammaLift = stats.meanLum < 85 ? 1.18 : stats.meanLum > 180 ? 0.88 : 1.0;

  // Match plain-English intent offline
  if (goal.includes('newspaper') || goal.includes('ink') || goal.includes('sketch') || goal.includes('print')) {
    return {
      summary: 'Applied crisp Atkinson ink dithering with lifted midtones for a clean print feel.',
      settings: {
        mode: 'braille',
        ditherAlgorithm: 'atkinson',
        ditherStrength: 90,
        colorMode: 'mono',
        monoForeground: '#EEF5F0',
        backgroundColor: '#070A08',
        contrast: Math.max(18, flatContrastBoost),
        brightness: brightnessOffset,
        gamma: gammaLift,
        edgeBoost: 25,
        blurRadius: 0,
        posterizeLevels: 0,
        inverse: false,
        crtOverlay: false,
      },
    };
  }

  if (goal.includes('game boy') || goal.includes('gameboy') || goal.includes('handheld')) {
    return {
      summary: 'Matched classic 4-shade Game Boy palette with structured Bayer 8×8 dithering.',
      settings: {
        mode: 'pixel',
        ditherAlgorithm: 'bayer8',
        ditherStrength: 75,
        colorMode: 'palette',
        paletteId: 'dmg-gameboy',
        contrast: Math.max(14, flatContrastBoost),
        brightness: brightnessOffset,
        gamma: gammaLift,
        edgeBoost: 10,
        blurRadius: 0,
        posterizeLevels: 0,
        columns: 88,
        autoFit: false,
        crtOverlay: false,
      },
    };
  }

  if (goal.includes('amber')) {
    return {
      summary: 'Configured warm P3 Amber phosphor blocks with smooth error-diffusion shading.',
      settings: {
        mode: 'ascii',
        charRampId: 'unicode-blocks',
        ditherAlgorithm: 'floyd-steinberg',
        ditherStrength: 75,
        colorMode: 'palette',
        paletteId: 'p3-amber',
        monoForeground: '#FFB000',
        backgroundColor: '#080602',
        contrast: flatContrastBoost,
        brightness: brightnessOffset,
        gamma: gammaLift,
        edgeBoost: 15,
        crtOverlay: true,
      },
    };
  }

  if (goal.includes('pixel') || goal.includes('retro') || goal.includes('arcade') || goal.includes('8-bit')) {
    return {
      summary: 'Set up vibrant 16-color PICO-8 pixel art with clean Bayer 4×4 shading.',
      settings: {
        mode: 'pixel',
        ditherAlgorithm: 'bayer4',
        ditherStrength: 65,
        colorMode: 'palette',
        paletteId: 'pico-8',
        contrast: Math.max(10, flatContrastBoost),
        brightness: brightnessOffset,
        gamma: gammaLift,
        edgeBoost: 5,
        blurRadius: 0,
        columns: 84,
        autoFit: false,
        crtOverlay: false,
      },
    };
  }

  if (goal.includes('stencil') || goal.includes('simple') || goal.includes('poster') || goal.includes('clean')) {
    return {
      summary: 'Simplified tones with gentle smoothing and 5-level posterization for bold shapes.',
      settings: {
        mode: 'pixel',
        ditherAlgorithm: 'none',
        ditherStrength: 0,
        colorMode: stats.meanSaturation > 0.25 ? 'palette' : 'grayscale',
        paletteId: 'pico-8',
        blurRadius: 1,
        posterizeLevels: 5,
        contrast: Math.max(20, flatContrastBoost),
        brightness: brightnessOffset,
        gamma: gammaLift,
        edgeBoost: 20,
        crtOverlay: false,
      },
    };
  }

  // Automatic smart tuning based purely on image histogram & edge/color traits
  const isColorful = stats.meanSaturation > 0.24;
  const isDetailedPhoto = stats.edgeDensity < 22;

  if (isColorful && isDetailedPhoto) {
    return {
      summary: 'Rich colors detected — tuned Double-Height Half-Blocks with smooth Bayer 4×4 shading.',
      settings: {
        mode: 'halfblock',
        cellAspectRatio: 0.5,
        ditherAlgorithm: 'bayer4',
        ditherStrength: 45,
        colorMode: 'truecolor',
        contrast: flatContrastBoost,
        brightness: brightnessOffset,
        gamma: gammaLift,
        edgeBoost: 10,
        blurRadius: 0,
        posterizeLevels: 16,
        crtOverlay: false,
      },
    };
  }

  if (isColorful) {
    return {
      summary: 'High-contrast color subject — applied PICO-8 retro palette with Bayer 8×8 dither.',
      settings: {
        mode: 'pixel',
        cellAspectRatio: 1.0,
        ditherAlgorithm: 'bayer8',
        ditherStrength: 70,
        colorMode: 'palette',
        paletteId: 'pico-8',
        contrast: flatContrastBoost,
        brightness: brightnessOffset,
        gamma: gammaLift,
        edgeBoost: 10,
        blurRadius: 0,
        posterizeLevels: 0,
        crtOverlay: false,
      },
    };
  }

  return {
    summary: 'Balanced shadows and midtones with Atkinson dithering for crisp monochrome detail.',
    settings: {
      mode: 'ascii',
      cellAspectRatio: 0.52,
      charRampId: 'ascii-standard',
      ditherAlgorithm: 'atkinson',
      ditherStrength: 80,
      colorMode: 'mono',
      monoForeground: '#33FF66',
      backgroundColor: '#050806',
      contrast: Math.max(12, flatContrastBoost),
      brightness: brightnessOffset,
      gamma: gammaLift,
      edgeBoost: 20,
      blurRadius: 0,
      posterizeLevels: 0,
      crtOverlay: true,
    },
  };
}
