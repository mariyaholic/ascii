import React, { useEffect } from 'react';
import { Bookmark, Grid3x3, Palette, Sliders, Sparkles, X } from 'lucide-react';
import type { InspectorTab } from './InspectorControls';

export type MobileSheetId = 'none' | 'mode' | 'dither' | 'color' | 'more';

interface MobileBottomBarProps {
  activeSheet: MobileSheetId;
  controlMode: 'simple' | 'pro';
  onSelectSheet: (sheet: MobileSheetId) => void;
  onOpenPalettes: () => void;
  onOpenCharacters: () => void;
  onOpenPresets: () => void;
  onOpenBatch: () => void;
  children: React.ReactNode;
}

export const MobileBottomBar: React.FC<MobileBottomBarProps> = ({
  activeSheet,
  controlMode,
  onSelectSheet,
  onOpenPalettes,
  onOpenCharacters,
  onOpenPresets,
  onOpenBatch,
  children,
}) => {
  const isGuided = controlMode === 'simple';

  const toggleSheet = (id: MobileSheetId) => {
    onSelectSheet(activeSheet === id ? 'none' : id);
  };

  // Escape closes the sheet, matching every other dialog in the studio.
  useEffect(() => {
    if (activeSheet === 'none') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onSelectSheet('none');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeSheet, onSelectSheet]);

  const canvasTab = { id: 'none' as const, label: 'Canvas', icon: <Grid3x3 className="h-5 w-5" /> };
  const styleTab = { id: 'mode' as const, label: 'Style', icon: <Sliders className="h-5 w-5" /> };
  const editorsTab = {
    id: 'more' as const,
    label: 'Editors',
    icon: <Bookmark className="h-5 w-5" />,
  };

  // Guided mode only owns one control sheet, so it only offers tabs that exist.
  const tabs: ReadonlyArray<{
    id: MobileSheetId;
    label: string;
    icon: React.ReactNode;
  }> = isGuided
    ? [canvasTab, styleTab, editorsTab]
    : [
        canvasTab,
        styleTab,
        { id: 'dither' as const, label: 'Dither', icon: <Sparkles className="h-5 w-5" /> },
        { id: 'color' as const, label: 'Color', icon: <Palette className="h-5 w-5" /> },
        editorsTab,
      ];

  const sheetTitle = (() => {
    if (activeSheet === 'mode') return isGuided ? 'Guided controls' : 'Style & grid';
    if (activeSheet === 'dither') return 'Dithering';
    if (activeSheet === 'color') return 'Color & glyphs';
    return 'Editors & tools';
  })();

  const editorLinks = [
    { label: 'Palettes', detail: 'Hardware and custom palettes', action: onOpenPalettes },
    { label: 'Character ramps', detail: 'ASCII and Unicode glyph order', action: onOpenCharacters },
    { label: 'Presets', detail: 'Saved studio looks', action: onOpenPresets },
    { label: 'Batch export', detail: 'Convert many images to a ZIP', action: onOpenBatch },
  ];

  return (
    <>
      {/* Slide-up mobile parameter sheet */}
      {activeSheet !== 'none' && (
        <section
          role="dialog"
          aria-label={sheetTitle}
          className="pg-above-bar fixed inset-x-0 z-30 flex max-h-[62dvh] flex-col overflow-hidden rounded-t-2xl border-t border-[var(--pg-border-strong)] bg-[var(--pg-surface)] shadow-2xl lg:hidden"
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--pg-border)] px-4 py-2">
            <span className="h-1 w-10 rounded-full bg-[var(--pg-border-strong)]" aria-hidden="true" />
            <h2 className="font-display text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--pg-muted)]">
              {sheetTitle}
            </h2>
            <button
              type="button"
              onClick={() => onSelectSheet('none')}
              className="pg-tap -mr-2 flex h-10 w-10 items-center justify-center rounded-md text-[var(--pg-muted)] transition-colors hover:text-[var(--pg-text)]"
              aria-label="Close controls"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="pg-sheet-body flex-1 overflow-y-auto pg-scroll">
            {activeSheet === 'more' ? (
              <div className="grid grid-cols-1 gap-2 p-4">
                {editorLinks.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => {
                      onSelectSheet('none');
                      item.action();
                    }}
                    className="pg-tap flex min-h-[52px] flex-col justify-center rounded-md border border-[var(--pg-border-strong)] bg-[var(--pg-well)] px-4 text-left transition-colors hover:border-[var(--pg-accent)]"
                  >
                    <span className="text-sm font-medium text-[var(--pg-text)]">{item.label}</span>
                    <span className="text-[11px] text-[var(--pg-muted)]">{item.detail}</span>
                  </button>
                ))}
              </div>
            ) : (
              children
            )}
          </div>
        </section>
      )}

      {/* Fixed bottom thumb-zone navigation (44px+ targets, home-indicator aware) */}
      <nav
        aria-label="Mobile studio controls"
        className={`pg-safe-bottom fixed inset-x-0 bottom-0 z-40 grid border-t border-[var(--pg-border)] bg-[var(--pg-surface)]/95 backdrop-blur-md lg:hidden ${
          isGuided ? 'grid-cols-3' : 'grid-cols-5'
        }`}
      >
        {tabs.map((tab) => {
          const isActive = activeSheet === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => (tab.id === 'none' ? onSelectSheet('none') : toggleSheet(tab.id))}
              aria-pressed={tab.id === 'none' ? activeSheet === 'none' : isActive}
              className={`pg-tap flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors ${
                isActive ? 'text-[var(--pg-accent)]' : 'text-[var(--pg-muted)]'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
};

export function mobileSheetToInspectorTab(sheet: MobileSheetId): InspectorTab {
  if (sheet === 'mode' || sheet === 'dither' || sheet === 'color') {
    return sheet;
  }
  return 'all';
}
