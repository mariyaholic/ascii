import React from 'react';
import { Bookmark, Grid3x3, Palette, Sliders, Sparkles, X } from 'lucide-react';
import type { InspectorTab } from './InspectorControls';

export type MobileSheetId = 'none' | 'mode' | 'dither' | 'color' | 'more';

interface MobileBottomBarProps {
  activeSheet: MobileSheetId;
  onSelectSheet: (sheet: MobileSheetId) => void;
  onOpenPalettes: () => void;
  onOpenCharacters: () => void;
  onOpenPresets: () => void;
  onOpenBatch: () => void;
  children: React.ReactNode;
}

export const MobileBottomBar: React.FC<MobileBottomBarProps> = ({
  activeSheet,
  onSelectSheet,
  onOpenPalettes,
  onOpenCharacters,
  onOpenPresets,
  onOpenBatch,
  children,
}) => {
  const toggleSheet = (id: MobileSheetId) => {
    onSelectSheet(activeSheet === id ? 'none' : id);
  };

  const tabs: ReadonlyArray<{
    id: MobileSheetId;
    label: string;
    icon: React.ReactNode;
  }> = [
    { id: 'none', label: 'Canvas', icon: <Grid3x3 className="w-5 h-5" /> },
    { id: 'mode', label: 'Style', icon: <Sliders className="w-5 h-5" /> },
    { id: 'dither', label: 'Dither', icon: <Sparkles className="w-5 h-5" /> },
    { id: 'color', label: 'Color', icon: <Palette className="w-5 h-5" /> },
    { id: 'more', label: 'Editors', icon: <Bookmark className="w-5 h-5" /> },
  ];

  return (
    <>
      {/* Slide-up Mobile Parameter Bottom Sheet */}
      {activeSheet !== 'none' && (
        <div className="lg:hidden fixed inset-x-0 bottom-14 z-30 max-h-[62vh] flex flex-col rounded-t-2xl border-t border-[var(--pg-border-strong)] bg-[var(--pg-surface)] shadow-2xl">
          <div className="flex items-center justify-between border-b border-[var(--pg-border)] px-4 py-2.5">
            <div className="mx-auto h-1 w-10 rounded-full bg-[var(--pg-border-strong)]" />
            <button
              type="button"
              onClick={() => onSelectSheet('none')}
              className="absolute right-3 top-1.5 flex h-10 w-10 items-center justify-center rounded-md text-[var(--pg-muted)] hover:text-[var(--pg-text)]"
              aria-label="Close control drawer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="overflow-y-auto pg-scroll">
            {activeSheet === 'more' ? (
              <div className="grid grid-cols-1 gap-2 p-4">
                <button
                  type="button"
                  onClick={() => {
                    onSelectSheet('none');
                    onOpenPalettes();
                  }}
                  className="flex min-h-[48px] items-center justify-between rounded-md border border-[var(--pg-border-strong)] bg-[var(--pg-well)] px-4 text-sm font-medium text-[var(--pg-text)]"
                >
                  <span>Custom Palette Editor</span>
                  <span className="text-xs text-[var(--pg-accent)]">Open</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onSelectSheet('none');
                    onOpenCharacters();
                  }}
                  className="flex min-h-[48px] items-center justify-between rounded-md border border-[var(--pg-border-strong)] bg-[var(--pg-well)] px-4 text-sm font-medium text-[var(--pg-text)]"
                >
                  <span>Unicode Character Ramp Editor</span>
                  <span className="text-xs text-[var(--pg-accent)]">Open</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onSelectSheet('none');
                    onOpenPresets();
                  }}
                  className="flex min-h-[48px] items-center justify-between rounded-md border border-[var(--pg-border-strong)] bg-[var(--pg-well)] px-4 text-sm font-medium text-[var(--pg-text)]"
                >
                  <span>Saved Presets</span>
                  <span className="text-xs text-[var(--pg-accent)]">Open</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onSelectSheet('none');
                    onOpenBatch();
                  }}
                  className="flex min-h-[48px] items-center justify-between rounded-md border border-[var(--pg-border-strong)] bg-[var(--pg-well)] px-4 text-sm font-medium text-[var(--pg-text)]"
                >
                  <span>Batch ZIP Processing</span>
                  <span className="text-xs text-[var(--pg-accent)]">Open</span>
                </button>
              </div>
            ) : (
              children
            )}
          </div>
        </div>
      )}

      {/* Fixed Bottom Thumb-Zone Navigation (<= 56px height, >= 44px touch targets) */}
      <nav
        aria-label="Mobile studio controls"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 grid h-14 grid-cols-5 border-t border-[var(--pg-border)] bg-[var(--pg-surface)]/95 backdrop-blur-md"
      >
        {tabs.map((tab) => {
          const isActive = activeSheet === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => (tab.id === 'none' ? onSelectSheet('none') : toggleSheet(tab.id))}
              className={`flex min-h-[44px] flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors cursor-pointer ${
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
