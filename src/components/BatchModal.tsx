import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FolderArchive,
  ImagePlus,
  Loader2,
  Trash2,
  X,
} from 'lucide-react';
import {
  type BatchFormatOptions,
  type BatchQueueItem,
  estimateOutputDimensions,
  inspectImageFile,
  runBatchZipExport,
  triggerZipDownload,
} from '../engine/batchProcessor';
import type { AnsiColorDepth } from '../engine/exporters';
import type { CharRampDefinition, PaletteDefinition, RenderSettings } from '../types/studio';

interface BatchModalProps {
  settings: RenderSettings;
  palette: PaletteDefinition;
  charRamp: CharRampDefinition;
  onClose: () => void;
}

export const BatchModal: React.FC<BatchModalProps> = ({
  settings,
  palette,
  charRamp,
  onClose,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const itemsRef = useRef<BatchQueueItem[]>([]);

  const [items, setItems] = useState<BatchQueueItem[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [zipBlob, setZipBlob] = useState<Blob | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);

  const [formats, setFormats] = useState<BatchFormatOptions>({
    includePng: true,
    includeTxt: true,
    includeAnsi: false,
    includeSvg: false,
    pngScale: 2,
    bakeCrt: settings.crtOverlay,
    ansiDepth: 'truecolor',
  });

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      for (const item of itemsRef.current) {
        URL.revokeObjectURL(item.previewUrl);
      }
    };
  }, []);

  const addFiles = async (fileList: FileList | File[]) => {
    setBatchError(null);
    setZipBlob(null);
    const imageFiles = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      setBatchError('No supported image files found (PNG, JPG, WebP, GIF).');
      return;
    }

    const added: BatchQueueItem[] = [];
    for (const file of imageFiles) {
      try {
        const meta = await inspectImageFile(file);
        added.push({
          id: `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          file,
          name: file.name,
          previewUrl: meta.previewUrl,
          width: meta.width,
          height: meta.height,
          status: 'queued',
        });
      } catch {
        // Skip unreadable image
      }
    }

    if (added.length > 0) {
      setItems((prev) => [...prev, ...added]);
    }
  };

  const removeItem = (id: string) => {
    setZipBlob(null);
    setItems((prev) => {
      const target = prev.find((i) => i.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
  };

  const clearAll = () => {
    setZipBlob(null);
    setBatchError(null);
    setItems((prev) => {
      for (const item of prev) URL.revokeObjectURL(item.previewUrl);
      return [];
    });
  };

  const anyFormatSelected =
    formats.includePng || formats.includeTxt || formats.includeAnsi || formats.includeSvg;

  const handleStartBatch = async () => {
    if (items.length === 0 || !anyFormatSelected || isRunning) return;
    setBatchError(null);
    setZipBlob(null);
    setIsRunning(true);

    // Reset statuses to queued
    setItems((prev) => prev.map((it) => ({ ...it, status: 'queued', error: undefined })));

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const blob = await runBatchZipExport(
        items,
        settings,
        palette,
        charRamp,
        formats,
        controller.signal,
        (id, status, error) => {
          setItems((prev) =>
            prev.map((it) => (it.id === id ? { ...it, status, error } : it))
          );
        }
      );

      setZipBlob(blob);
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
      triggerZipDownload(blob, `phosphorgrid-batch-${stamp}.zip`);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setBatchError('Batch processing cancelled.');
      } else {
        setBatchError(err instanceof Error ? err.message : 'Batch ZIP export failed.');
      }
    } finally {
      setIsRunning(false);
      abortRef.current = null;
    }
  };

  const completedCount = items.filter((i) => i.status === 'done' || i.status === 'error').length;
  const progressPct = items.length > 0 ? Math.round((completedCount / items.length) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-[var(--pg-border-strong)] bg-[var(--pg-surface)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--pg-border)] px-5 py-3.5">
          <div>
            <h2 className="font-display text-base font-semibold text-[var(--pg-text)]">
              Batch ZIP Processor
            </h2>
            <p className="mt-0.5 font-mono-grid text-xs text-[var(--pg-muted)]">
              Applying {settings.mode} · {settings.ditherAlgorithm} · {settings.colorMode} ·{' '}
              {settings.autoFit ? 'Auto-Fit Grid' : `${settings.columns} cols`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              abortRef.current?.abort();
              onClose();
            }}
            className="flex h-9 w-9 items-center justify-center rounded text-[var(--pg-muted)] hover:bg-[var(--pg-elevated)] hover:text-[var(--pg-text)] cursor-pointer"
            aria-label="Close batch processor"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Upload Dropzone & Queue Toolbar */}
        <div className="border-b border-[var(--pg-border)] bg-[var(--pg-well)] p-4 space-y-3">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragOver(false);
              if (!isRunning && e.dataTransfer.files?.length) {
                addFiles(e.dataTransfer.files);
              }
            }}
            className={`flex flex-col sm:flex-row items-center justify-between gap-3 rounded-md border border-dashed p-3.5 transition-colors ${
              isDragOver
                ? 'border-[var(--pg-accent)] bg-[var(--pg-accent-soft)]'
                : 'border-[var(--pg-border-strong)] bg-[var(--pg-surface)]'
            }`}
          >
            <div className="flex items-center gap-3 text-center sm:text-left">
              <ImagePlus className="w-5 h-5 shrink-0 text-[var(--pg-accent)]" aria-hidden="true" />
              <div>
                <p className="text-xs font-medium text-[var(--pg-text)]">
                  Drop multiple images here or browse files
                </p>
                <p className="text-[11px] text-[var(--pg-muted)]">
                  Current studio render settings will be applied to every image in the queue.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={isRunning}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-md bg-[var(--pg-accent)] px-3.5 py-2 text-xs font-semibold text-[var(--pg-accent-ink)] hover:opacity-90 disabled:opacity-40 cursor-pointer whitespace-nowrap"
              >
                <ImagePlus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Add Images</span>
              </button>
              {items.length > 0 && !isRunning && (
                <button
                  type="button"
                  onClick={clearAll}
                  className="inline-flex items-center gap-1 rounded-md border border-[var(--pg-border-strong)] bg-[var(--pg-well)] px-3 py-2 text-xs font-medium text-[var(--pg-muted)] hover:text-red-300 cursor-pointer whitespace-nowrap"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Clear</span>
                </button>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) addFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </div>

          {/* Output Format Checkboxes inside ZIP */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-medium text-[var(--pg-muted)]">Include in ZIP:</span>
              {(
                [
                  { key: 'includePng', label: 'Raster PNG' },
                  { key: 'includeTxt', label: 'Unicode TXT' },
                  { key: 'includeAnsi', label: 'ANSI (.ans)' },
                  { key: 'includeSvg', label: 'Vector SVG' },
                ] as const
              ).map((fmt) => (
                <label
                  key={fmt.key}
                  className="flex items-center gap-1.5 text-[var(--pg-text)] cursor-pointer select-none"
                >
                  <input
                    type="checkbox"
                    disabled={isRunning}
                    checked={formats[fmt.key]}
                    onChange={(e) => {
                      setZipBlob(null);
                      setFormats((prev) => ({ ...prev, [fmt.key]: e.target.checked }));
                    }}
                    className="accent-[var(--pg-accent)] h-4 w-4 rounded"
                  />
                  <span>{fmt.label}</span>
                </label>
              ))}
            </div>

            {formats.includePng && (
              <div className="flex items-center gap-2">
                <span className="text-[var(--pg-muted)]">PNG Scale:</span>
                {[1, 2].map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={isRunning}
                    onClick={() => {
                      setZipBlob(null);
                      setFormats((prev) => ({ ...prev, pngScale: s }));
                    }}
                    className={`rounded px-2 py-0.5 font-mono-grid text-[11px] cursor-pointer ${
                      formats.pngScale === s
                        ? 'bg-[var(--pg-accent-soft)] text-[var(--pg-accent)] border border-[var(--pg-accent)]'
                        : 'border border-[var(--pg-border)] text-[var(--pg-muted)]'
                    }`}
                  >
                    {s}×
                  </button>
                ))}
                <label className="flex items-center gap-1.5 text-[var(--pg-muted)] cursor-pointer select-none ml-1">
                  <input
                    type="checkbox"
                    disabled={isRunning}
                    checked={formats.bakeCrt}
                    onChange={(e) => {
                      setZipBlob(null);
                      setFormats((prev) => ({ ...prev, bakeCrt: e.target.checked }));
                    }}
                    className="accent-[var(--pg-accent)] h-3.5 w-3.5 rounded"
                  />
                  <span>CRT FX</span>
                </label>
              </div>
            )}

            {formats.includeAnsi && (
              <div className="flex items-center gap-1.5">
                <span className="text-[var(--pg-muted)]">ANSI:</span>
                <select
                  disabled={isRunning}
                  value={formats.ansiDepth}
                  onChange={(e) => {
                    setZipBlob(null);
                    setFormats((prev) => ({
                      ...prev,
                      ansiDepth: e.target.value as AnsiColorDepth,
                    }));
                  }}
                  className="rounded border border-[var(--pg-border-strong)] bg-[var(--pg-surface)] px-2 py-0.5 text-[11px] text-[var(--pg-text)]"
                >
                  <option value="truecolor">24-Bit</option>
                  <option value="256">256-Color</option>
                  <option value="16">16-Color</option>
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Queue List */}
        <div className="flex-1 min-h-[200px] overflow-y-auto pg-scroll divide-y divide-[var(--pg-border)]">
          {items.length === 0 ? (
            <div className="flex h-full min-h-[200px] flex-col items-center justify-center p-8 text-center">
              <FolderArchive className="w-8 h-8 text-[var(--pg-muted)]/60" aria-hidden="true" />
              <p className="mt-2 text-sm font-medium text-[var(--pg-text)]">
                No images queued yet
              </p>
              <p className="mt-1 max-w-sm text-xs text-[var(--pg-muted)]">
                Select multiple photos or artwork files above to convert them all in one pass and download a compressed ZIP archive.
              </p>
            </div>
          ) : (
            items.map((item) => {
              const est = estimateOutputDimensions(item.width, item.height, settings);
              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 px-5 py-2.5 hover:bg-[var(--pg-elevated)]/30"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={item.previewUrl}
                      alt={item.name}
                      className="h-10 w-10 shrink-0 rounded border border-[var(--pg-border)] object-cover bg-black"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-[var(--pg-text)]">
                        {item.name}
                      </p>
                      <p className="font-mono-grid text-[11px] text-[var(--pg-muted)]">
                        Source {item.width}×{item.height}
                        <span aria-hidden="true"> · </span>
                        Output {est.cols}×{est.rows}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {item.status === 'queued' && (
                      <span className="text-xs text-[var(--pg-muted)]">Queued</span>
                    )}
                    {item.status === 'processing' && (
                      <span className="inline-flex items-center gap-1.5 text-xs text-[var(--pg-accent)]">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                        <span>Rendering</span>
                      </span>
                    )}
                    {item.status === 'done' && (
                      <span className="inline-flex items-center gap-1 text-xs text-[var(--pg-accent)]">
                        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Done</span>
                      </span>
                    )}
                    {item.status === 'error' && (
                      <span
                        className="inline-flex items-center gap-1 text-xs text-red-300"
                        title={item.error}
                      >
                        <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Error</span>
                      </span>
                    )}

                    {!isRunning && (
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        className="p-1.5 rounded text-[var(--pg-muted)] hover:text-red-300 cursor-pointer"
                        aria-label={`Remove ${item.name}`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Progress & Action */}
        <div className="border-t border-[var(--pg-border)] bg-[var(--pg-surface)] px-5 py-3.5 space-y-2.5">
          {isRunning && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs font-mono-grid">
                <span className="text-[var(--pg-text)]">
                  Processing {completedCount} / {items.length}
                </span>
                <span className="text-[var(--pg-accent)]">{progressPct}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--pg-well)]">
                <div
                  className="h-full bg-[var(--pg-accent)] transition-all duration-150"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}

          {batchError && <p className="text-xs text-amber-300">{batchError}</p>}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="font-mono-grid text-xs text-[var(--pg-muted)]">
              {items.length} {items.length === 1 ? 'image' : 'images'} queued
              {!anyFormatSelected ? ' · Select at least 1 format' : ''}
            </span>

            <div className="flex items-center gap-2">
              {isRunning ? (
                <button
                  type="button"
                  onClick={() => abortRef.current?.abort()}
                  className="rounded-md border border-red-500/40 bg-[var(--pg-well)] px-4 py-2 text-xs font-medium text-red-300 hover:bg-red-950/40 cursor-pointer"
                >
                  Cancel
                </button>
              ) : (
                <>
                  {zipBlob && (
                    <button
                      type="button"
                      onClick={() => {
                        const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
                        triggerZipDownload(zipBlob, `phosphorgrid-batch-${stamp}.zip`);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-md border border-[var(--pg-border-strong)] bg-[var(--pg-elevated)] px-3.5 py-2 text-xs font-medium text-[var(--pg-text)] hover:border-[var(--pg-accent)] cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Download ZIP Again</span>
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={items.length === 0 || !anyFormatSelected}
                    onClick={handleStartBatch}
                    className="inline-flex items-center gap-2 rounded-md bg-[var(--pg-accent)] px-4 py-2 text-xs font-semibold text-[var(--pg-accent-ink)] hover:opacity-90 disabled:opacity-40 cursor-pointer whitespace-nowrap"
                  >
                    <FolderArchive className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Process &amp; Export ZIP</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
