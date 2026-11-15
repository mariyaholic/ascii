import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  Columns2,
  ImagePlus,
  Maximize2,
  Monitor,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { SAMPLE_IMAGES } from '../data/presets';
import { renderResultToCanvas } from '../engine/exporters';
import type { RenderResult, RenderSettings, SourceImageInfo } from '../types/studio';

interface CRTCanvasViewportProps {
  sourceImage: SourceImageInfo | null;
  renderResult: RenderResult | null;
  settings: RenderSettings;
  isProcessing: boolean;
  errorMessage: string | null;
  onSelectFile: (file: File) => void;
  onSelectSample: (sampleId: string) => void;
  onToggleCrt: () => void;
}

export const CRTCanvasViewport: React.FC<CRTCanvasViewportProps> = ({
  sourceImage,
  renderResult,
  settings,
  isProcessing,
  errorMessage,
  onSelectFile,
  onSelectSample,
  onToggleCrt,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
  const [isDragOverFile, setIsDragOverFile] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [splitPercent, setSplitPercent] = useState(50);
  const [isDraggingSplit, setIsDraggingSplit] = useState(false);
  const [canvasDims, setCanvasDims] = useState<{ w: number; h: number }>({ w: 1, h: 1 });

  const dragOriginRef = useRef<{ x: number; y: number; panX: number; panY: number }>({
    x: 0,
    y: 0,
    panX: 0,
    panY: 0,
  });

  // Render result onto the display canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !renderResult) return;
    renderResultToCanvas(canvas, renderResult, settings.cellAspectRatio, 2, false);
    setCanvasDims({ w: canvas.width, h: canvas.height });
  }, [renderResult, settings.cellAspectRatio]);

  const fitToViewport = useCallback(() => {
    const container = containerRef.current;
    if (!container || canvasDims.w <= 1 || canvasDims.h <= 1) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      return;
    }
    const pad = window.innerWidth < 768 ? 24 : 56;
    const availW = Math.max(120, container.clientWidth - pad);
    const availH = Math.max(120, container.clientHeight - pad);
    const scale = Math.min(availW / canvasDims.w, availH / canvasDims.h, 3);
    setZoom(Math.max(0.15, Math.round(scale * 100) / 100));
    setPan({ x: 0, y: 0 });
  }, [canvasDims.w, canvasDims.h]);

  // Auto-fit when source image changes
  useEffect(() => {
    if (sourceImage && canvasDims.w > 1) {
      fitToViewport();
    }
  }, [sourceImage?.id, canvasDims.w, canvasDims.h, fitToViewport]);

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    setZoom((z) => Math.max(0.15, Math.min(8, Math.round(z * factor * 100) / 100)));
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingSplit) return;
    if ((e.target as HTMLElement).closest('button, input, label, [data-split-handle]')) {
      return;
    }
    setIsDraggingCanvas(true);
    dragOriginRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingSplit && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setSplitPercent(Math.max(5, Math.min(95, pct)));
      return;
    }
    if (!isDraggingCanvas) return;
    const dx = e.clientX - dragOriginRef.current.x;
    const dy = e.clientY - dragOriginRef.current.y;
    setPan({
      x: dragOriginRef.current.panX + dx,
      y: dragOriginRef.current.panY + dy,
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingSplit) {
      setIsDraggingSplit(false);
    }
    if (isDraggingCanvas) {
      setIsDraggingCanvas(false);
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOverFile(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      onSelectFile(file);
    }
  };

  return (
    <section className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--pg-well)]">
      {/* Top Source & Sample Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--pg-border)] bg-[var(--pg-surface)]/80 px-4 py-2.5">
        <div className="flex items-center gap-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex min-h-[36px] items-center gap-2 rounded-md border border-[var(--pg-border-strong)] bg-[var(--pg-elevated)] px-3 py-1.5 text-xs font-medium text-[var(--pg-text)] hover:border-[var(--pg-accent)] hover:text-[var(--pg-accent)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ImagePlus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Load Image</span>
          </button>

          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            className="inline-flex sm:hidden min-h-[36px] items-center gap-1.5 rounded-md border border-[var(--pg-border-strong)] bg-[var(--pg-elevated)] px-2.5 py-1.5 text-xs font-medium text-[var(--pg-text)] whitespace-nowrap shrink-0 cursor-pointer"
            aria-label="Capture photo with camera"
          >
            <Camera className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Camera</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onSelectFile(file);
              e.target.value = '';
            }}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onSelectFile(file);
              e.target.value = '';
            }}
          />

          <span className="hidden sm:inline text-xs text-[var(--pg-muted)] px-1" aria-hidden="true">
            Samples:
          </span>

          <div className="flex items-center gap-1 rounded-md bg-[var(--pg-well)] p-1 border border-[var(--pg-border)]">
            {SAMPLE_IMAGES.map((sample) => {
              const isSelected = sourceImage?.id === sample.id;
              return (
                <button
                  key={sample.id}
                  type="button"
                  onClick={() => onSelectSample(sample.id)}
                  className={`rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isSelected
                      ? 'bg-[var(--pg-elevated)] text-[var(--pg-accent)] border border-[var(--pg-border-strong)]'
                      : 'text-[var(--pg-muted)] hover:text-[var(--pg-text)] border border-transparent'
                  }`}
                >
                  {sample.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Clean Unboxed Telemetry Readout */}
        <div className="hidden sm:flex items-center gap-2 text-xs text-[var(--pg-muted)] font-mono-grid whitespace-nowrap">
          {sourceImage && (
            <>
              <span>
                Source {sourceImage.width}×{sourceImage.height}
              </span>
              <span aria-hidden="true">·</span>
            </>
          )}
          {renderResult && (
            <>
              <span className="text-[var(--pg-text)]">
                Grid {renderResult.cols}×{renderResult.rows}
              </span>
              <span aria-hidden="true">·</span>
              <span>{renderResult.renderTimeMs} ms</span>
            </>
          )}
          {isProcessing && <span className="text-[var(--pg-accent)]">Rendering…</span>}
        </div>
      </div>

      {/* Interactive CRT Viewport Well */}
      <div
        ref={containerRef}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOverFile(true);
        }}
        onDragLeave={() => setIsDragOverFile(false)}
        onDrop={handleDrop}
        className={`relative flex-1 overflow-hidden select-none touch-none flex items-center justify-center ${
          isDraggingCanvas ? 'cursor-grabbing' : 'cursor-grab'
        }`}
      >
        {/* Subtle calibration grid behind canvas */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              'radial-gradient(var(--pg-border-strong) 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }}
        />

        {errorMessage && (
          <div className="z-20 max-w-md rounded-lg border border-red-500/40 bg-[var(--pg-surface)] p-5 text-center shadow-xl">
            <p className="text-sm font-medium text-red-300">Unable to load image</p>
            <p className="mt-1 text-xs text-[var(--pg-muted)]">{errorMessage}</p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-4 rounded-md bg-[var(--pg-accent)] px-4 py-2 text-xs font-semibold text-[var(--pg-accent-ink)] cursor-pointer"
            >
              Choose Another Image
            </button>
          </div>
        )}

        {/* Transformed Canvas Stage */}
        {sourceImage && !errorMessage && (
          <div
            className="relative flex items-center justify-center will-change-transform"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: 'center center',
            }}
          >
            {/* Rendered Pixel/ASCII Output Canvas */}
            <div className="relative rounded border border-[var(--pg-border-strong)] shadow-2xl overflow-hidden bg-black">
              <canvas
                ref={canvasRef}
                className="block"
                style={{
                  imageRendering:
                    settings.mode === 'pixel' || settings.mode === 'halfblock'
                      ? 'pixelated'
                      : 'auto',
                }}
              />

              {/* Original Source Overlay for Split-Compare */}
              {compareMode && (
                <div
                  className="absolute inset-0 overflow-hidden pointer-events-none"
                  style={{
                    clipPath: `inset(0 ${100 - splitPercent}% 0 0)`,
                  }}
                >
                  <img
                    src={sourceImage.src}
                    alt={sourceImage.name}
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-fill"
                  />
                </div>
              )}

              {/* Optional CRT Scanlines & Phosphor Vignette */}
              {settings.crtOverlay && (
                <>
                  <div className="crt-scanlines pointer-events-none absolute inset-0 opacity-75" />
                  <div className="crt-vignette pointer-events-none absolute inset-0" />
                </>
              )}
            </div>
          </div>
        )}

        {/* Interactive Split Comparison Vertical Handle */}
        {compareMode && sourceImage && (
          <div
            data-split-handle
            onPointerDown={(e) => {
              e.stopPropagation();
              setIsDraggingSplit(true);
            }}
            className="absolute inset-y-0 z-20 w-8 -ml-4 flex items-center justify-center cursor-ew-resize"
            style={{ left: `${splitPercent}%` }}
            role="slider"
            aria-label="Before and after comparison divider"
            aria-valuemin={5}
            aria-valuemax={95}
            aria-valuenow={Math.round(splitPercent)}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft') setSplitPercent((p) => Math.max(5, p - 4));
              if (e.key === 'ArrowRight') setSplitPercent((p) => Math.min(95, p + 4));
            }}
          >
            <div className="h-full w-0.5 bg-[var(--pg-accent)] shadow-[0_0_8px_var(--pg-accent-glow)]" />
            <div className="absolute top-1/2 -translate-y-1/2 rounded border border-[var(--pg-accent)] bg-[var(--pg-surface)] px-1.5 py-2 text-[10px] font-mono-grid text-[var(--pg-accent)]">
              ◀▶
            </div>
          </div>
        )}

        {/* Drag-and-Drop Overlay */}
        {isDragOverFile && (
          <div className="absolute inset-4 z-30 flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-[var(--pg-accent)] bg-[var(--pg-bg)]/90 backdrop-blur-sm">
            <ImagePlus className="w-8 h-8 text-[var(--pg-accent)]" />
            <p className="mt-2 text-sm font-medium text-[var(--pg-text)]">
              Drop image to render into pixels &amp; ASCII
            </p>
            <p className="mt-1 text-xs text-[var(--pg-muted)]">
              PNG, JPG, WebP, GIF, or paste with Ctrl/Cmd+V
            </p>
          </div>
        )}

        {/* Bottom Floating Viewport Controls */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 rounded-md border border-[var(--pg-border-strong)] bg-[var(--pg-surface)]/95 p-1 shadow-xl backdrop-blur-md">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.15, Math.round((z - 0.2) * 100) / 100))}
            className="flex h-8 w-8 items-center justify-center rounded text-[var(--pg-muted)] hover:bg-[var(--pg-elevated)] hover:text-[var(--pg-text)] transition-colors cursor-pointer"
            aria-label="Zoom out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="min-w-[50px] text-center text-xs font-mono-grid text-[var(--pg-text)]">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(8, Math.round((z + 0.2) * 100) / 100))}
            className="flex h-8 w-8 items-center justify-center rounded text-[var(--pg-muted)] hover:bg-[var(--pg-elevated)] hover:text-[var(--pg-text)] transition-colors cursor-pointer"
            aria-label="Zoom in"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>

          <div className="mx-1 h-4 w-px bg-[var(--pg-border)]" aria-hidden="true" />

          <button
            type="button"
            onClick={fitToViewport}
            className="inline-flex h-8 items-center gap-1.5 rounded px-2.5 text-xs font-medium text-[var(--pg-muted)] hover:bg-[var(--pg-elevated)] hover:text-[var(--pg-text)] transition-colors whitespace-nowrap cursor-pointer"
            title="Fit to screen"
          >
            <Maximize2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Fit</span>
          </button>

          <button
            type="button"
            onClick={() => setCompareMode((c) => !c)}
            className={`inline-flex h-8 items-center gap-1.5 rounded px-2.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
              compareMode
                ? 'bg-[var(--pg-accent-soft)] text-[var(--pg-accent)]'
                : 'text-[var(--pg-muted)] hover:bg-[var(--pg-elevated)] hover:text-[var(--pg-text)]'
            }`}
            title="Toggle before and after split comparison"
          >
            <Columns2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Compare</span>
          </button>

          <button
            type="button"
            onClick={onToggleCrt}
            className={`inline-flex h-8 items-center gap-1.5 rounded px-2.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
              settings.crtOverlay
                ? 'bg-[var(--pg-accent-soft)] text-[var(--pg-accent)]'
                : 'text-[var(--pg-muted)] hover:bg-[var(--pg-elevated)] hover:text-[var(--pg-text)]'
            }`}
            title="Toggle CRT scanline preview"
          >
            <Monitor className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">CRT</span>
          </button>
        </div>
      </div>
    </section>
  );
};
