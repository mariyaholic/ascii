import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Download, X } from 'lucide-react';
import {
  type AnsiColorDepth,
  downloadCanvasPng,
  downloadTextFile,
  exportToAnsi,
  exportToPlainText,
  exportToSvg,
  renderResultToCanvas,
} from '../engine/exporters';
import type { RenderResult, RenderSettings } from '../types/studio';

type ExportTab = 'txt' | 'ansi' | 'png' | 'svg';

interface ExportModalProps {
  renderResult: RenderResult | null;
  settings: RenderSettings;
  sourceName: string;
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  renderResult,
  settings,
  sourceName,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<ExportTab>('txt');
  const [ansiDepth, setAnsiDepth] = useState<AnsiColorDepth>('truecolor');
  const [pngScale, setPngScale] = useState<number>(2);
  const [bakeCrt, setBakeCrt] = useState<boolean>(settings.crtOverlay);
  const [copiedState, setCopiedState] = useState<string | null>(null);
  const pngPreviewRef = useRef<HTMLCanvasElement>(null);

  const safeBaseName = useMemo(
    () => sourceName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '-').toLowerCase() || 'phosphorgrid',
    [sourceName]
  );

  const textOutput = useMemo(() => {
    if (!renderResult) return '';
    if (activeTab === 'txt') return exportToPlainText(renderResult);
    if (activeTab === 'ansi') return exportToAnsi(renderResult, ansiDepth);
    if (activeTab === 'svg') return exportToSvg(renderResult, settings.cellAspectRatio);
    return '';
  }, [renderResult, activeTab, ansiDepth, settings.cellAspectRatio]);

  useEffect(() => {
    if (activeTab === 'png' && renderResult && pngPreviewRef.current) {
      renderResultToCanvas(
        pngPreviewRef.current,
        renderResult,
        settings.cellAspectRatio,
        pngScale,
        bakeCrt
      );
    }
  }, [activeTab, renderResult, settings.cellAspectRatio, pngScale, bakeCrt]);

  if (!renderResult) return null;

  const byteSize = new Blob([textOutput]).size;
  const formattedBytes =
    byteSize > 1024 * 1024
      ? `${(byteSize / (1024 * 1024)).toFixed(2)} MB`
      : byteSize > 1024
      ? `${(byteSize / 1024).toFixed(1)} KB`
      : `${byteSize} B`;

  const markCopied = (label: string) => {
    setCopiedState(label);
    setTimeout(() => setCopiedState(null), 1600);
  };

  const handleCopy = async () => {
    if (activeTab === 'png' && pngPreviewRef.current) {
      try {
        const blob = await new Promise<Blob | null>((resolve) =>
          pngPreviewRef.current?.toBlob((b) => resolve(b), 'image/png')
        );
        if (blob && typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          markCopied('PNG Image Copied');
          return;
        }
      } catch {
        // Fallback if clipboard image write is restricted
      }
      downloadCanvasPng(pngPreviewRef.current, `${safeBaseName}.png`);
      markCopied('Downloaded PNG');
      return;
    }

    await navigator.clipboard?.writeText(textOutput);
    markCopied('Copied to Clipboard');
  };

  const handleDownload = () => {
    if (activeTab === 'txt') {
      downloadTextFile(textOutput, `${safeBaseName}.txt`, 'text/plain;charset=utf-8');
    } else if (activeTab === 'ansi') {
      downloadTextFile(textOutput, `${safeBaseName}.ans`, 'text/plain;charset=utf-8');
    } else if (activeTab === 'svg') {
      downloadTextFile(textOutput, `${safeBaseName}.svg`, 'image/svg+xml;charset=utf-8');
    } else if (activeTab === 'png' && pngPreviewRef.current) {
      downloadCanvasPng(pngPreviewRef.current, `${safeBaseName}.png`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-[var(--pg-border-strong)] bg-[var(--pg-surface)] shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[var(--pg-border)] px-5 py-3.5">
          <div>
            <h2 className="font-display text-base font-semibold text-[var(--pg-text)]">
              Export Artwork
            </h2>
            <p className="font-mono-grid text-xs text-[var(--pg-muted)]">
              Grid {renderResult.cols}×{renderResult.rows} · Mode {renderResult.mode}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded text-[var(--pg-muted)] hover:bg-[var(--pg-elevated)] hover:text-[var(--pg-text)] cursor-pointer"
            aria-label="Close export modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Format Tabs */}
        <div className="flex items-center justify-between gap-3 border-b border-[var(--pg-border)] bg-[var(--pg-well)] px-5 py-2.5">
          <div className="flex items-center gap-1 rounded-md bg-[var(--pg-surface)] p-1 border border-[var(--pg-border)]">
            {(
              [
                { id: 'txt', label: 'Unicode TXT' },
                { id: 'ansi', label: 'ANSI (.ans)' },
                { id: 'png', label: 'Raster PNG' },
                { id: 'svg', label: 'Vector SVG' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`rounded px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-[var(--pg-accent)] text-[var(--pg-accent-ink)] font-semibold'
                    : 'text-[var(--pg-muted)] hover:text-[var(--pg-text)]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab !== 'png' && (
            <span className="font-mono-grid text-xs text-[var(--pg-muted)]">{formattedBytes}</span>
          )}
        </div>

        {/* Format-Specific Options */}
        {activeTab === 'ansi' && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--pg-border)] px-5 py-2.5 text-xs">
            <span className="text-[var(--pg-muted)]">ANSI Escape Color Depth</span>
            <div className="flex items-center gap-1">
              {(['16', '256', 'truecolor'] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setAnsiDepth(d)}
                  className={`rounded px-2.5 py-1 font-medium cursor-pointer ${
                    ansiDepth === d
                      ? 'bg-[var(--pg-accent-soft)] text-[var(--pg-accent)] border border-[var(--pg-accent)]'
                      : 'border border-[var(--pg-border)] text-[var(--pg-muted)] hover:text-[var(--pg-text)]'
                  }`}
                >
                  {d === 'truecolor' ? '24-Bit TrueColor' : `${d}-Color`}
                </button>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'png' && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--pg-border)] px-5 py-2.5 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-[var(--pg-muted)]">Resolution Scale</span>
              {[1, 2, 4].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setPngScale(s)}
                  className={`rounded px-2.5 py-1 font-mono-grid font-medium cursor-pointer ${
                    pngScale === s
                      ? 'bg-[var(--pg-accent-soft)] text-[var(--pg-accent)] border border-[var(--pg-accent)]'
                      : 'border border-[var(--pg-border)] text-[var(--pg-muted)] hover:text-[var(--pg-text)]'
                  }`}
                >
                  {s}×
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-[var(--pg-text)] cursor-pointer">
              <input
                type="checkbox"
                checked={bakeCrt}
                onChange={(e) => setBakeCrt(e.target.checked)}
                className="accent-[var(--pg-accent)] h-4 w-4 rounded"
              />
              <span>Bake CRT Scanlines</span>
            </label>
          </div>
        )}

        {/* Preview Stage */}
        <div className="flex-1 min-h-[220px] overflow-auto pg-scroll bg-black p-4">
          {activeTab === 'png' ? (
            <div className="flex min-h-full items-center justify-center">
              <canvas
                ref={pngPreviewRef}
                className="max-h-[42vh] max-w-full rounded border border-[var(--pg-border-strong)] object-contain"
              />
            </div>
          ) : (
            <pre className="font-mono-grid text-[10px] leading-[1.05] text-[var(--pg-text)] whitespace-pre overflow-x-auto">
              {textOutput.slice(0, 18000)}
              {textOutput.length > 18000 ? '\n… (preview truncated, full output included in copy/download)' : ''}
            </pre>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-[var(--pg-border)] bg-[var(--pg-surface)] px-5 py-3.5">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-2 rounded-md border border-[var(--pg-border-strong)] bg-[var(--pg-elevated)] px-4 py-2 text-xs font-medium text-[var(--pg-text)] hover:border-[var(--pg-accent)] cursor-pointer"
          >
            {copiedState ? (
              <>
                <Check className="w-3.5 h-3.5 text-[var(--pg-accent)]" aria-hidden="true" />
                <span className="text-[var(--pg-accent)]">{copiedState}</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Copy to Clipboard</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center gap-2 rounded-md bg-[var(--pg-accent)] px-4 py-2 text-xs font-semibold text-[var(--pg-accent-ink)] hover:opacity-90 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Download .{activeTab === 'ansi' ? 'ans' : activeTab}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
