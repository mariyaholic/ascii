import { rgbToHex } from './imageProcessor';
import type { RenderResult } from '../types/studio';

export type AnsiColorDepth = '16' | '256' | 'truecolor';

export function exportToPlainText(result: RenderResult): string {
  const lines: string[] = [];
  const { cols, rows, codepoints } = result;
  for (let y = 0; y < rows; y++) {
    let line = '';
    const rowOff = y * cols;
    for (let x = 0; x < cols; x++) {
      line += String.fromCodePoint(codepoints[rowOff + x]);
    }
    lines.push(line);
  }
  return lines.join('\n');
}

const ANSI_16_RGB: ReadonlyArray<readonly [number, number, number]> = [
  [0, 0, 0],
  [128, 0, 0],
  [0, 128, 0],
  [128, 128, 0],
  [0, 0, 128],
  [128, 0, 128],
  [0, 128, 128],
  [192, 192, 192],
  [128, 128, 128],
  [255, 0, 0],
  [0, 255, 0],
  [255, 255, 0],
  [0, 0, 255],
  [255, 0, 255],
  [0, 255, 255],
  [255, 255, 255],
];

function nearestAnsi16(r: number, g: number, b: number): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < 16; i++) {
    const [ar, ag, ab] = ANSI_16_RGB[i];
    const dist = (r - ar) ** 2 + (g - ag) ** 2 + (b - ab) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

function rgbToAnsi256(r: number, g: number, b: number): number {
  if (r === g && g === b) {
    if (r < 8) return 16;
    if (r > 248) return 231;
    return Math.round(((r - 8) / 247) * 24) + 232;
  }
  const ri = Math.round((r / 255) * 5);
  const gi = Math.round((g / 255) * 5);
  const bi = Math.round((b / 255) * 5);
  return 16 + 36 * ri + 6 * gi + bi;
}

export function exportToAnsi(result: RenderResult, depth: AnsiColorDepth): string {
  const { cols, rows, codepoints, fgRgba, bgRgba, mode } = result;
  const lines: string[] = [];
  const includeBg = mode === 'halfblock' || mode === 'pixel';

  for (let y = 0; y < rows; y++) {
    let line = '';
    let prevKey = '';
    const rowOff = y * cols;
    for (let x = 0; x < cols; x++) {
      const idx = rowOff + x;
      const c = idx * 4;
      const fr = fgRgba[c];
      const fg = fgRgba[c + 1];
      const fb = fgRgba[c + 2];
      const br = bgRgba[c];
      const bg = bgRgba[c + 1];
      const bb = bgRgba[c + 2];
      const ch = mode === 'pixel' ? ' ' : String.fromCodePoint(codepoints[idx]);

      let seq = '';
      let key = '';
      if (depth === 'truecolor') {
        key = includeBg
          ? `38;2;${fr};${fg};${fb};48;2;${br};${bg};${bb}`
          : `38;2;${fr};${fg};${fb}`;
        seq = `\x1b[${key}m`;
      } else if (depth === '256') {
        const fc = rgbToAnsi256(fr, fg, fb);
        const bc = rgbToAnsi256(br, bg, bb);
        key = includeBg ? `38;5;${fc};48;5;${bc}` : `38;5;${fc}`;
        seq = `\x1b[${key}m`;
      } else {
        const f16 = nearestAnsi16(fr, fg, fb);
        const b16 = nearestAnsi16(br, bg, bb);
        const fCode = f16 < 8 ? 30 + f16 : 90 + (f16 - 8);
        const bCode = b16 < 8 ? 40 + b16 : 100 + (b16 - 8);
        key = includeBg ? `${fCode};${bCode}` : `${fCode}`;
        seq = `\x1b[${key}m`;
      }

      if (key !== prevKey) {
        line += seq;
        prevKey = key;
      }
      line += ch;
    }
    line += '\x1b[0m';
    lines.push(line);
  }
  return lines.join('\n');
}

export function exportToSvg(result: RenderResult, cellAspectRatio: number): string {
  const { cols, rows, mode, codepoints, fgRgba, bgRgba } = result;
  const cellW = mode === 'pixel' ? 10 : 10;
  const cellH = mode === 'pixel' ? 10 : Math.max(10, Math.round(cellW / Math.max(0.25, cellAspectRatio)));
  const width = cols * cellW;
  const height = rows * cellH;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" shape-rendering="crispEdges">`
  );

  // Base background
  const bg0 = rgbToHex(bgRgba[0] ?? 5, bgRgba[1] ?? 8, bgRgba[2] ?? 6);
  parts.push(`<rect width="${width}" height="${height}" fill="${bg0}" />`);

  if (mode === 'pixel') {
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const c = (y * cols + x) * 4;
        const hex = rgbToHex(fgRgba[c], fgRgba[c + 1], fgRgba[c + 2]);
        if (hex !== bg0) {
          parts.push(`<rect x="${x * cellW}" y="${y * cellH}" width="${cellW}" height="${cellH}" fill="${hex}" />`);
        }
      }
    }
  } else if (mode === 'halfblock') {
    const halfH = cellH / 2;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const c = (y * cols + x) * 4;
        const topHex = rgbToHex(fgRgba[c], fgRgba[c + 1], fgRgba[c + 2]);
        const botHex = rgbToHex(bgRgba[c], bgRgba[c + 1], bgRgba[c + 2]);
        if (topHex !== bg0) {
          parts.push(`<rect x="${x * cellW}" y="${y * cellH}" width="${cellW}" height="${halfH}" fill="${topHex}" />`);
        }
        if (botHex !== bg0) {
          parts.push(`<rect x="${x * cellW}" y="${y * cellH + halfH}" width="${cellW}" height="${halfH}" fill="${botHex}" />`);
        }
      }
    }
  } else {
    const fontSize = Math.round(cellH * 0.86);
    parts.push(
      `<g font-family="JetBrains Mono, ui-monospace, monospace" font-size="${fontSize}" text-anchor="start" dominant-baseline="text-before-edge">`
    );
    for (let y = 0; y < rows; y++) {
      const py = y * cellH;
      const rowOff = y * cols;
      for (let x = 0; x < cols; x++) {
        const idx = rowOff + x;
        const cp = codepoints[idx];
        if (cp === 32 || cp === 0x2800) continue; // skip empty space / blank braille
        const ch = escapeXml(String.fromCodePoint(cp));
        const c = idx * 4;
        const hex = rgbToHex(fgRgba[c], fgRgba[c + 1], fgRgba[c + 2]);
        parts.push(`<text x="${x * cellW}" y="${py}" fill="${hex}">${ch}</text>`);
      }
    }
    parts.push('</g>');
  }

  parts.push('</svg>');
  return parts.join('\n');
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function renderResultToCanvas(
  canvas: HTMLCanvasElement,
  result: RenderResult,
  cellAspectRatio: number,
  scale = 1,
  includeCrt = false
): void {
  const { cols, rows, mode, codepoints, fgRgba, bgRgba } = result;
  const baseCellW = mode === 'pixel' ? 10 * scale : 10 * scale;
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

  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = `rgb(${bgRgba[0] ?? 5}, ${bgRgba[1] ?? 8}, ${bgRgba[2] ?? 6})`;
  ctx.fillRect(0, 0, width, height);

  if (mode === 'pixel') {
    for (let y = 0; y < rows; y++) {
      const py = y * baseCellH;
      const rowOff = y * cols;
      for (let x = 0; x < cols; x++) {
        const c = (rowOff + x) * 4;
        ctx.fillStyle = `rgb(${fgRgba[c]},${fgRgba[c + 1]},${fgRgba[c + 2]})`;
        ctx.fillRect(x * baseCellW, py, baseCellW, baseCellH);
      }
    }
  } else if (mode === 'halfblock') {
    const halfH = Math.ceil(baseCellH / 2);
    for (let y = 0; y < rows; y++) {
      const py = y * baseCellH;
      const rowOff = y * cols;
      for (let x = 0; x < cols; x++) {
        const c = (rowOff + x) * 4;
        ctx.fillStyle = `rgb(${fgRgba[c]},${fgRgba[c + 1]},${fgRgba[c + 2]})`;
        ctx.fillRect(x * baseCellW, py, baseCellW, halfH);
        ctx.fillStyle = `rgb(${bgRgba[c]},${bgRgba[c + 1]},${bgRgba[c + 2]})`;
        ctx.fillRect(x * baseCellW, py + halfH, baseCellW, baseCellH - halfH);
      }
    }
  } else {
    const fontSize = Math.max(6, Math.round(baseCellH * 0.92));
    ctx.font = `500 ${fontSize}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

    for (let y = 0; y < rows; y++) {
      const py = y * baseCellH + baseCellH * 0.52;
      const rowOff = y * cols;
      for (let x = 0; x < cols; x++) {
        const idx = rowOff + x;
        const cp = codepoints[idx];
        if (cp === 32 || cp === 0x2800) continue;
        const c = idx * 4;
        ctx.fillStyle = `rgb(${fgRgba[c]},${fgRgba[c + 1]},${fgRgba[c + 2]})`;
        ctx.fillText(String.fromCodePoint(cp), x * baseCellW + baseCellW * 0.5, py);
      }
    }
  }

  if (includeCrt) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
    for (let y = 0; y < height; y += 3) {
      ctx.fillRect(0, y, width, 1);
    }
    const grad = ctx.createRadialGradient(
      width / 2,
      height / 2,
      Math.min(width, height) * 0.3,
      width / 2,
      height / 2,
      Math.max(width, height) * 0.72
    );
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  }
}

export function downloadTextFile(content: string, filename: string, mime = 'text/plain;charset=utf-8'): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadCanvasPng(canvas: HTMLCanvasElement, filename: string): void {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 'image/png');
}
