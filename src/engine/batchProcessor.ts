import JSZip from 'jszip';
import {
  type AnsiColorDepth,
  exportToAnsi,
  exportToPlainText,
  exportToSvg,
  renderResultToCanvas,
} from './exporters';
import { computeTargetDimensions, processImageBuffer } from './imageProcessor';
import type { CharRampDefinition, PaletteDefinition, RenderSettings } from '../types/studio';

export interface BatchFormatOptions {
  includePng: boolean;
  includeTxt: boolean;
  includeAnsi: boolean;
  includeSvg: boolean;
  pngScale: number;
  bakeCrt: boolean;
  ansiDepth: AnsiColorDepth;
}

export interface BatchQueueItem {
  id: string;
  file: File;
  name: string;
  previewUrl: string;
  width: number;
  height: number;
  status: 'queued' | 'processing' | 'done' | 'error';
  error?: string;
}

function sanitizeBaseName(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '-');
  return base.replace(/^-+|-+$/g, '') || 'render';
}

function computeAutoFitCols(imgWidth: number, imgHeight: number): number {
  const ratio = imgWidth / Math.max(1, imgHeight);
  const suggested = Math.round(
    Math.min(imgWidth / 6, 112 * Math.sqrt(Math.min(1.8, Math.max(0.6, ratio))))
  );
  return Math.max(64, Math.min(136, suggested));
}

export async function inspectImageFile(file: File): Promise<{
  previewUrl: string;
  width: number;
  height: number;
}> {
  const previewUrl = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({
        previewUrl,
        width: img.naturalWidth,
        height: img.naturalHeight,
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(previewUrl);
      reject(new Error(`Unable to decode "${file.name}".`));
    };
    img.src = previewUrl;
  });
}

async function decodeFileToPixels(file: File): Promise<{
  rgba: Uint8ClampedArray;
  workW: number;
  workH: number;
  naturalW: number;
  naturalH: number;
}> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error(`Could not decode ${file.name}`));
      el.src = url;
    });

    const maxEdge = 1280;
    const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
    const workW = Math.max(1, Math.round(img.naturalWidth * scale));
    const workH = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = workW;
    canvas.height = workH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable.');

    ctx.drawImage(img, 0, 0, workW, workH);
    const data = ctx.getImageData(0, 0, workW, workH).data;
    return {
      rgba: data,
      workW,
      workH,
      naturalW: img.naturalWidth,
      naturalH: img.naturalHeight,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to encode PNG.'));
    }, 'image/png');
  });
}

export function estimateOutputDimensions(
  width: number,
  height: number,
  settings: RenderSettings
): { cols: number; rows: number } {
  const effectiveSettings = settings.autoFit
    ? { ...settings, columns: computeAutoFitCols(width, height) }
    : settings;
  const { cols, rows } = computeTargetDimensions(width, height, effectiveSettings);
  return { cols, rows };
}

export async function runBatchZipExport(
  items: BatchQueueItem[],
  settings: RenderSettings,
  palette: PaletteDefinition,
  charRamp: CharRampDefinition,
  formats: BatchFormatOptions,
  signal: AbortSignal,
  onItemStatus: (id: string, status: BatchQueueItem['status'], error?: string) => void
): Promise<Blob> {
  const zip = new JSZip();
  const usedBaseNames = new Map<string, number>();
  const offscreenCanvas = document.createElement('canvas');

  for (const item of items) {
    if (signal.aborted) {
      throw new DOMException('Batch processing cancelled', 'AbortError');
    }

    onItemStatus(item.id, 'processing');
    // Yield to browser paint so status updates render smoothly
    await new Promise((r) => setTimeout(r, 0));

    try {
      const decoded = await decodeFileToPixels(item.file);
      const effectiveSettings: RenderSettings = settings.autoFit
        ? { ...settings, columns: computeAutoFitCols(decoded.naturalW, decoded.naturalH) }
        : settings;

      const result = processImageBuffer(
        decoded.rgba,
        decoded.workW,
        decoded.workH,
        effectiveSettings,
        palette,
        charRamp
      );

      const rawBase = sanitizeBaseName(item.name);
      const count = (usedBaseNames.get(rawBase) ?? 0) + 1;
      usedBaseNames.set(rawBase, count);
      const uniqueBase = count === 1 ? rawBase : `${rawBase}-${count}`;

      if (formats.includeTxt) {
        zip.file(`${uniqueBase}.txt`, exportToPlainText(result));
      }
      if (formats.includeAnsi) {
        zip.file(`${uniqueBase}.ans`, exportToAnsi(result, formats.ansiDepth));
      }
      if (formats.includeSvg) {
        zip.file(`${uniqueBase}.svg`, exportToSvg(result, effectiveSettings.cellAspectRatio));
      }
      if (formats.includePng) {
        renderResultToCanvas(
          offscreenCanvas,
          result,
          effectiveSettings.cellAspectRatio,
          formats.pngScale,
          formats.bakeCrt
        );
        const pngBlob = await canvasToPngBlob(offscreenCanvas);
        zip.file(`${uniqueBase}.png`, pngBlob);
      }

      onItemStatus(item.id, 'done');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Processing failed';
      onItemStatus(item.id, 'error', msg);
    }
  }

  if (signal.aborted) {
    throw new DOMException('Batch processing cancelled', 'AbortError');
  }

  return zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

export function triggerZipDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
