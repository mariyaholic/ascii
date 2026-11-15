import { relativeLuminance } from './imageProcessor';
import type { CharRampDefinition, RenderResult, RenderSettings } from '../types/studio';

export interface ContrastSuggestion {
  id: string;
  category: 'brightness' | 'contrast' | 'ramp';
  label: string;
  reason: string;
  actionLabel: string;
  patch: Partial<RenderSettings>;
}

export interface ContrastAnalysis {
  cols: number;
  rows: number;
  /**
   * 0 = Adequate contrast
   * 1 = Flat / compressed midtone plateau (low local variation)
   * 2 = Clipped shadow or highlight saturation
   * 3 = Poor FG/BG glyph visibility (ratio < 3.0)
   */
  cellFlags: Uint8Array;
  affectedPercent: number;
  crushedShadowPct: number;
  clippedHighlightPct: number;
  flatMidtonePct: number;
  lowVisibilityPct: number;
  statusLabel: 'Balanced Contrast' | 'Moderate Compression' | 'Poor Contrast Regions';
  suggestions: ContrastSuggestion[];
}

function srgbChannelToLinear(c8: number): number {
  const s = c8 / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function wcagLuminance(r: number, g: number, b: number): number {
  return (
    0.2126 * srgbChannelToLinear(r) +
    0.7152 * srgbChannelToLinear(g) +
    0.0722 * srgbChannelToLinear(b)
  );
}

function wcagContrastRatio(
  fr: number,
  fg: number,
  fb: number,
  br: number,
  bg: number,
  bb: number
): number {
  const l1 = wcagLuminance(fr, fg, fb);
  const l2 = wcagLuminance(br, bg, bb);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function countPopBits(mask: number): number {
  let n = mask;
  let c = 0;
  while (n) {
    c += n & 1;
    n >>>= 1;
  }
  return c;
}

export function analyzeRenderContrast(
  result: RenderResult,
  settings: RenderSettings,
  charRamp: CharRampDefinition
): ContrastAnalysis {
  const { cols, rows, mode, codepoints, fgRgba, bgRgba } = result;
  const total = cols * rows;
  const cellFlags = new Uint8Array(total);

  // Build lookup from codepoint to normalized density [0..1] in current ramp
  const rampChars = Array.from(charRamp.chars.length > 0 ? charRamp.chars : ' .:-=+*#%@');
  const rampDensityMap = new Map<number, number>();
  const rampMaxIdx = Math.max(1, rampChars.length - 1);
  rampChars.forEach((ch, idx) => {
    const cp = ch.codePointAt(0) ?? 32;
    rampDensityMap.set(cp, idx / rampMaxIdx);
  });

  // Compute scalar perceptual energy [0..1] per rendered cell
  const cellEnergy = new Float32Array(total);
  const cellFgBgLow = new Uint8Array(total);

  let lowVisibilityCount = 0;
  let crushedCount = 0;
  let clippedCount = 0;
  let flatCount = 0;

  for (let i = 0; i < total; i++) {
    const c = i * 4;
    const fr = fgRgba[c];
    const fg = fgRgba[c + 1];
    const fb = fgRgba[c + 2];
    const br = bgRgba[c];
    const bg = bgRgba[c + 1];
    const bb = bgRgba[c + 2];
    const cp = codepoints[i];

    if (mode === 'pixel') {
      cellEnergy[i] = relativeLuminance(fr, fg, fb);
    } else if (mode === 'halfblock') {
      const topL = relativeLuminance(fr, fg, fb);
      const botL = relativeLuminance(br, bg, bb);
      cellEnergy[i] = (topL + botL) * 0.5;
    } else if (mode === 'braille') {
      const dotCount = countPopBits(Math.max(0, cp - 0x2800));
      const dotDensity = dotCount / 8;
      const fgL = relativeLuminance(fr, fg, fb);
      cellEnergy[i] = dotDensity * fgL;

      if (dotCount > 0) {
        const ratio = wcagContrastRatio(fr, fg, fb, br, bg, bb);
        if (ratio < 3.0) {
          cellFgBgLow[i] = 1;
        }
      }
    } else {
      // ASCII / Unicode mode
      const density = rampDensityMap.get(cp) ?? (cp === 32 ? 0 : 0.5);
      const fgL = relativeLuminance(fr, fg, fb);
      cellEnergy[i] = settings.colorMode === 'mono' ? density : density * fgL;

      if (cp !== 32 && cp !== 0x00a0) {
        const ratio = wcagContrastRatio(fr, fg, fb, br, bg, bb);
        if (ratio < 3.0) {
          cellFgBgLow[i] = 1;
        }
      }
    }
  }

  // Evaluate 3x3 neighborhood contrast & clipping for every cell
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const idx = y * cols + x;
      const e = cellEnergy[idx];

      let minN = 1;
      let maxN = 0;
      let sumDiff = 0;
      let nCount = 0;

      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= rows) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= cols || (dx === 0 && dy === 0)) continue;
          const ne = cellEnergy[ny * cols + nx];
          if (ne < minN) minN = ne;
          if (ne > maxN) maxN = ne;
          sumDiff += Math.abs(e - ne);
          nCount++;
        }
      }

      const localSpan = maxN - minN;
      const avgDiff = nCount > 0 ? sumDiff / nCount : 0;

      if (cellFgBgLow[idx] === 1) {
        cellFlags[idx] = 3;
        lowVisibilityCount++;
      } else if (e <= 0.04 && localSpan < 0.06) {
        cellFlags[idx] = 2;
        crushedCount++;
      } else if (e >= 0.96 && localSpan < 0.06) {
        cellFlags[idx] = 2;
        clippedCount++;
      } else if (localSpan < 0.08 && avgDiff < 0.03) {
        cellFlags[idx] = 1;
        flatCount++;
      }
    }
  }

  const affectedTotal = lowVisibilityCount + crushedCount + clippedCount + flatCount;
  const affectedPercent = Math.round((affectedTotal / Math.max(1, total)) * 100);
  const crushedShadowPct = Math.round((crushedCount / Math.max(1, total)) * 100);
  const clippedHighlightPct = Math.round((clippedCount / Math.max(1, total)) * 100);
  const flatMidtonePct = Math.round((flatCount / Math.max(1, total)) * 100);
  const lowVisibilityPct = Math.round((lowVisibilityCount / Math.max(1, total)) * 100);

  const statusLabel: ContrastAnalysis['statusLabel'] =
    affectedPercent >= 45
      ? 'Poor Contrast Regions'
      : affectedPercent >= 22
      ? 'Moderate Compression'
      : 'Balanced Contrast';

  // Generate concrete, prioritized adjustment suggestions
  const suggestions: ContrastSuggestion[] = [];

  if (crushedShadowPct >= 18 && crushedShadowPct > clippedHighlightPct + 8) {
    const nextBrightness = Math.min(60, settings.brightness + 16);
    const nextGamma = Math.min(2.2, Math.round((settings.gamma + 0.2) * 100) / 100);
    suggestions.push({
      id: 'lift-brightness',
      category: 'brightness',
      label: `Lift Brightness (${nextBrightness > 0 ? `+${nextBrightness}` : nextBrightness})`,
      reason: `${crushedShadowPct}% of cells are crushed into near-black shadows with lost detail.`,
      actionLabel: 'Lift Shadows',
      patch: { brightness: nextBrightness, gamma: nextGamma },
    });
  } else if (clippedHighlightPct >= 18 && clippedHighlightPct > crushedShadowPct + 8) {
    const nextBrightness = Math.max(-60, settings.brightness - 16);
    const nextGamma = Math.max(0.5, Math.round((settings.gamma - 0.15) * 100) / 100);
    suggestions.push({
      id: 'lower-brightness',
      category: 'brightness',
      label: `Reduce Brightness (${nextBrightness})`,
      reason: `${clippedHighlightPct}% of cells are blown out to maximum solid brightness.`,
      actionLabel: 'Recover Highlights',
      patch: { brightness: nextBrightness, gamma: nextGamma },
    });
  }

  if (flatMidtonePct >= 18 || lowVisibilityPct >= 12) {
    const nextContrast = Math.min(65, settings.contrast + 18);
    const nextEdge = Math.min(60, Math.max(settings.edgeBoost, 25));
    suggestions.push({
      id: 'boost-contrast',
      category: 'contrast',
      label: `Increase Contrast (+${nextContrast})`,
      reason:
        lowVisibilityPct >= 12
          ? `${lowVisibilityPct}% of rendered glyphs fall below 3:1 foreground-to-background contrast.`
          : `${flatMidtonePct}% of cells sit in compressed flat regions with weak local separation.`,
      actionLabel: 'Boost Contrast',
      patch: { contrast: nextContrast, edgeBoost: nextEdge },
    });
  }

  if (mode === 'ascii') {
    if (rampChars.length <= 6 && (flatMidtonePct >= 14 || affectedPercent >= 25)) {
      suggestions.push({
        id: 'denser-ramp',
        category: 'ramp',
        label: 'Use Denser Character Ramp (10–70 steps)',
        reason: `Your current ${rampChars.length}-glyph ramp compresses subtle shading into flat bands.`,
        actionLabel: 'Use Dense ASCII',
        patch: { charRampId: 'ascii-dense' },
      });
    } else if (rampChars.length >= 25 && lowVisibilityPct >= 15) {
      suggestions.push({
        id: 'bolder-ramp',
        category: 'ramp',
        label: 'Switch to Bolder Block Ramp',
        reason: `${lowVisibilityPct}% of fine glyphs are hard to distinguish against the background.`,
        actionLabel: 'Use Shade Blocks',
        patch: { charRampId: 'unicode-blocks' },
      });
    } else if (settings.charRampId === 'ascii-standard' && flatMidtonePct >= 20) {
      suggestions.push({
        id: 'dense-70-ramp',
        category: 'ramp',
        label: 'Expand to 70-Step ASCII Ramp',
        reason: `${flatMidtonePct}% flat regions would gain finer tonal steps with a denser glyph ramp.`,
        actionLabel: 'Expand Ramp',
        patch: { charRampId: 'ascii-dense' },
      });
    }
  }

  if (lowVisibilityPct >= 15 && settings.colorMode !== 'mono') {
    suggestions.push({
      id: 'high-contrast-mono',
      category: 'contrast',
      label: 'Lift Brightness & Contrast for Legibility',
      reason: `${lowVisibilityPct}% of colored glyphs blend closely into the dark background.`,
      actionLabel: 'Clarify Tones',
      patch: {
        brightness: Math.min(50, settings.brightness + 12),
        contrast: Math.min(60, settings.contrast + 16),
      },
    });
  }

  return {
    cols,
    rows,
    cellFlags,
    affectedPercent,
    crushedShadowPct,
    clippedHighlightPct,
    flatMidtonePct,
    lowVisibilityPct,
    statusLabel,
    suggestions,
  };
}

export function renderContrastOverlayToCanvas(
  canvas: HTMLCanvasElement,
  analysis: ContrastAnalysis,
  cellAspectRatio: number,
  mode: RenderSettings['mode'],
  scale = 2
): void {
  const { cols, rows, cellFlags } = analysis;
  const baseCellW = 10 * scale;
  const baseCellH =
    mode === 'pixel'
      ? baseCellW
      : Math.max(6, Math.round(baseCellW / Math.max(0.25, cellAspectRatio)));

  const width = Math.max(1, cols * baseCellW);
  const height = Math.max(1, rows * baseCellH);

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, width, height);

  // Draw crisp color + pattern-coded highlight cells for accessibility
  for (let y = 0; y < rows; y++) {
    const py = y * baseCellH;
    const rowOff = y * cols;
    for (let x = 0; x < cols; x++) {
      const flag = cellFlags[rowOff + x];
      if (flag === 0) continue;

      const px = x * baseCellW;
      if (flag === 3) {
        // Poor FG/BG visibility: Crimson tint + crisp border
        ctx.fillStyle = 'rgba(239, 68, 68, 0.42)';
        ctx.fillRect(px, py, baseCellW, baseCellH);
        ctx.strokeStyle = 'rgba(252, 165, 165, 0.75)';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 0.5, py + 0.5, baseCellW - 1, baseCellH - 1);
      } else if (flag === 2) {
        // Crushed shadows / clipped highlights: Amber tint + diagonal marker
        ctx.fillStyle = 'rgba(245, 158, 11, 0.34)';
        ctx.fillRect(px, py, baseCellW, baseCellH);
        ctx.strokeStyle = 'rgba(252, 211, 77, 0.65)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px + 1, py + baseCellH - 1);
        ctx.lineTo(px + baseCellW - 1, py + 1);
        ctx.stroke();
      } else if (flag === 1) {
        // Flat midtone compression: Cyan tint
        ctx.fillStyle = 'rgba(56, 189, 248, 0.24)';
        ctx.fillRect(px, py, baseCellW, baseCellH);
      }
    }
  }
}
