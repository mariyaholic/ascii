import React from 'react';
import { CheckCircle2, Sparkles, X } from 'lucide-react';
import type { ContrastAnalysis } from '../engine/contrastAnalyzer';
import type { RenderSettings } from '../types/studio';

interface ContrastDiagnosticsPanelProps {
  analysis: ContrastAnalysis;
  onApplyPatch: (patch: Partial<RenderSettings>) => void;
  onClose: () => void;
}

export const ContrastDiagnosticsPanel: React.FC<ContrastDiagnosticsPanelProps> = ({
  analysis,
  onApplyPatch,
  onClose,
}) => {
  const handleApplyAll = () => {
    const merged: Partial<RenderSettings> = {};
    for (const s of analysis.suggestions) {
      Object.assign(merged, s.patch);
    }
    onApplyPatch(merged);
  };

  return (
    <div
      data-overlay-panel
      className="absolute top-3 right-3 z-20 w-[calc(100%-1.5rem)] max-w-[310px] rounded-md border border-[var(--pg-border-strong)] bg-[var(--pg-surface)]/95 p-3.5 shadow-2xl backdrop-blur-md"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-xs font-semibold uppercase tracking-wider text-[var(--pg-text)]">
            Contrast Overlay
          </h3>
          <p className="mt-0.5 font-mono-grid text-xs text-[var(--pg-muted)]">
            <span
              className={
                analysis.affectedPercent >= 45
                  ? 'text-red-300'
                  : analysis.affectedPercent >= 22
                  ? 'text-amber-300'
                  : 'text-[var(--pg-accent)]'
              }
            >
              {analysis.statusLabel}
            </span>
            <span aria-hidden="true"> · </span>
            <span>{analysis.affectedPercent}% flagged</span>
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded text-[var(--pg-muted)] hover:bg-[var(--pg-elevated)] hover:text-[var(--pg-text)] cursor-pointer"
          aria-label="Close contrast overlay"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Accessible Legend (Color + Geometric Indicator + Tabular %) */}
      <div className="mt-3 grid grid-cols-1 gap-1.5 border-y border-[var(--pg-border)] py-2.5 text-[11px]">
        <div className="flex items-center justify-between text-[var(--pg-muted)]">
          <span className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-3 w-3 rounded-xs border border-red-300 bg-red-500/45"
            />
            <span>Low Glyph Visibility (&lt;3:1)</span>
          </span>
          <span className="font-mono-grid text-[var(--pg-text)]">
            {analysis.lowVisibilityPct}%
          </span>
        </div>

        <div className="flex items-center justify-between text-[var(--pg-muted)]">
          <span className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-3 w-3 rounded-xs border border-amber-300 bg-amber-500/40"
              style={{
                backgroundImage:
                  'linear-gradient(135deg, transparent 42%, rgba(252,211,77,0.85) 48%, rgba(252,211,77,0.85) 52%, transparent 58%)',
              }}
            />
            <span>Crushed Shadows / Highlights</span>
          </span>
          <span className="font-mono-grid text-[var(--pg-text)]">
            {analysis.crushedShadowPct + analysis.clippedHighlightPct}%
          </span>
        </div>

        <div className="flex items-center justify-between text-[var(--pg-muted)]">
          <span className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-3 w-3 rounded-xs bg-sky-400/35 border border-sky-400/50"
            />
            <span>Compressed Flat Regions</span>
          </span>
          <span className="font-mono-grid text-[var(--pg-text)]">
            {analysis.flatMidtonePct}%
          </span>
        </div>
      </div>

      {/* Actionable Suggestions */}
      <div className="mt-3 space-y-2 max-h-[210px] overflow-y-auto pg-scroll">
        {analysis.suggestions.length === 0 ? (
          <div className="flex items-center gap-2 text-xs text-[var(--pg-accent)] py-1">
            <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Tonal separation and glyph readability look solid across this grid.</span>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-[var(--pg-muted)]">
                Suggested Fixes
              </span>
              {analysis.suggestions.length > 1 && (
                <button
                  type="button"
                  onClick={handleApplyAll}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--pg-accent)] hover:underline cursor-pointer"
                >
                  <Sparkles className="w-3 h-3" aria-hidden="true" />
                  <span>Apply All</span>
                </button>
              )}
            </div>

            {analysis.suggestions.map((sug) => (
              <div
                key={sug.id}
                className="rounded border border-[var(--pg-border)] bg-[var(--pg-well)] p-2.5 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-[var(--pg-text)]">
                    {sug.label}
                  </span>
                  <button
                    type="button"
                    onClick={() => onApplyPatch(sug.patch)}
                    className="shrink-0 rounded bg-[var(--pg-accent)] px-2.5 py-1 text-[11px] font-semibold text-[var(--pg-accent-ink)] hover:opacity-90 cursor-pointer whitespace-nowrap"
                  >
                    {sug.actionLabel}
                  </button>
                </div>
                <p className="text-[11px] leading-snug text-[var(--pg-muted)]">
                  {sug.reason}
                </p>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
};
