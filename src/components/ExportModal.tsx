import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Download } from 'lucide-react';
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
import { Button, ModalShell, Segmented } from './ui/Modal';

type ExportTab = 'txt' | 'ansi' | 'png' | 'svg';

interface ExportModalProps {
  renderResult: RenderResult | null;
  settings: RenderSettings;
  sourceName: string;
  onClose: () => void;
}

const FORMAT_TABS = [
  { id: 'txt', label: 'Unicode TXT', compactLabel: 'TXT' },
  { id: 'ansi', label: 'ANSI (.ans)', compactLabel: 'ANSI' },
  { id: 'png', label: 'Raster PNG', compactLabel: 'PNG' },
  { id: 'svg', label: 'Vector SVG', compactLabel: 'SVG' },
] as const;

const ANSI_DEPTHS = [
  { id: '16', label: '16-Color', compactLabel: '16' },
  { id: '256', label: '256-Color', compactLabel: '256' },
  { id: 'truecolor', label: '24-Bit TrueColor', compactLabel: '24-bit' },
] as const;

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
    () =>
      sourceName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '-').toLowerCase() ||
      'phosphorgrid',
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
          markCopied('PNG image copied');
          return;
        }
      } catch {
        // Clipboard image writes are blocked on some browsers; fall back to download.
      }
      downloadCanvasPng(pngPreviewRef.current, `${safeBaseName}.png`);
      markCopied('PNG downloaded');
      return;
    }

    await navigator.clipboard?.writeText(textOutput);
    markCopied('Copied to clipboard');
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
    <ModalShell
      title="Export"
      subtitle={`Grid ${renderResult.cols}×${renderResult.rows} · ${renderResult.mode} · ${formattedBytes}`}
      size="lg"
      onClose={onClose}
      closeLabel="Close export dialog"
      bodyClassName="bg-black"
      toolbar={
        <div className="px-4 py-2.5 sm:px-5">
          <Segmented
            label="Export format"
            value={activeTab}
            options={FORMAT_TABS}
            onChange={(id) => setActiveTab(id)}
          />
          {activeTab === 'ansi' && (
            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--pg-border)] pt-2.5">
              <span className="text-xs text-[var(--pg-muted)]">Escape color depth</span>
              <Segmented
                value={ansiDepth}
                options={ANSI_DEPTHS}
                onChange={(depth) => setAnsiDepth(depth)}
                className="min-w-[200px] flex-1 sm:max-w-[320px]"
              />
            </div>
          )}
          {activeTab === 'png' && (
            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--pg-border)] pt-2.5 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-[var(--pg-muted)]">Resolution</span>
                {[1, 2, 4].map((scale) => (
                  <button
                    key={scale}
                    type="button"
                    onClick={() => setPngScale(scale)}
                    aria-pressed={pngScale === scale}
                    className={`pg-tap min-h-[34px] min-w-[44px] rounded border font-mono-grid font-medium ${
                      pngScale === scale
                        ? 'border-[var(--pg-accent)] bg-[var(--pg-accent-soft)] text-[var(--pg-accent)]'
                        : 'border-[var(--pg-border)] text-[var(--pg-muted)] hover:text-[var(--pg-text)]'
                    }`}
                  >
                    {scale}×
                  </button>
                ))}
              </div>
              <label className="flex min-h-[34px] cursor-pointer select-none items-center gap-2 text-[var(--pg-text)]">
                <input
                  type="checkbox"
                  checked={bakeCrt}
                  onChange={(e) => setBakeCrt(e.target.checked)}
                  className="h-4 w-4 rounded accent-[var(--pg-accent)]"
                />
                <span>Bake CRT scanlines</span>
              </label>
            </div>
          )}
        </div>
      }
      footer={
        <>
          <Button onClick={handleCopy} disabled={!textOutput && activeTab !== 'png'}>
            {copiedState ? (
              <>
                <Check className="h-3.5 w-3.5 text-[var(--pg-accent)]" aria-hidden="true" />
                <span className="text-[var(--pg-accent)]">{copiedState}</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Copy</span>
              </>
            )}
          </Button>
          <Button variant="primary" onClick={handleDownload}>
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Download .{activeTab === 'ansi' ? 'ans' : activeTab}</span>
            <span className="sm:hidden">Save</span>
          </Button>
        </>
      }
    >
      {activeTab === 'png' ? (
        <div className="flex min-h-[220px] items-center justify-center p-4">
          <canvas
            ref={pngPreviewRef}
            className="max-h-[46dvh] max-w-full rounded border border-[var(--pg-border-strong)] object-contain sm:max-h-[42vh]"
          />
        </div>
      ) : (
        <pre className="min-h-[220px] overflow-x-auto whitespace-pre p-4 font-mono-grid text-[10px] leading-[1.05] text-[var(--pg-text)]">
          {textOutput.slice(0, 18000)}
          {textOutput.length > 18000
            ? '\n… (preview truncated, full output included in copy/download)'
            : ''}
        </pre>
      )}
    </ModalShell>
  );
};
