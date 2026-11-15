import React from 'react';
import { Download } from 'lucide-react';
import type { WorkspaceSection } from '../types/studio';
import { PWAInstallButton } from './PWAInstallButton';

interface StudioHeaderProps {
  activeSection: WorkspaceSection;
  onSelectSection: (section: WorkspaceSection) => void;
  onOpenExport: () => void;
}

const NAV_ITEMS: ReadonlyArray<{ id: WorkspaceSection; label: string }> = [
  { id: 'studio', label: 'Studio' },
  { id: 'palettes', label: 'Palettes' },
  { id: 'characters', label: 'Characters' },
  { id: 'presets', label: 'Presets' },
  { id: 'batch', label: 'Batch' },
];

export const StudioHeader: React.FC<StudioHeaderProps> = ({
  activeSection,
  onSelectSection,
  onOpenExport,
}) => {
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-4 lg:gap-8 border-b border-[var(--pg-border)] bg-[var(--pg-surface)] px-4 lg:px-6">
      {/* Zone 1: Single-element Brand Wordmark */}
      <a
        href="#studio"
        onClick={(e) => {
          e.preventDefault();
          onSelectSection('studio');
        }}
        className="font-display text-lg font-bold tracking-tight text-[var(--pg-text)] whitespace-nowrap shrink-0 hover:text-[var(--pg-accent)] transition-colors"
      >
        PhosphorGrid
      </a>

      {/* Zone 2: 4 clean single-line navigation links */}
      <nav className="hidden md:flex items-center gap-6" aria-label="Workspace navigation">
        {NAV_ITEMS.map((item) => {
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectSection(item.id)}
              className={`relative py-1 text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isActive
                  ? 'text-[var(--pg-accent)]'
                  : 'text-[var(--pg-muted)] hover:text-[var(--pg-text)]'
              }`}
            >
              {item.label}
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 -bottom-[15px] h-0.5 bg-[var(--pg-accent)]"
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Zone 3: Primary Export Action (+ conditional PWA install) */}
      <div className="flex items-center gap-2.5 shrink-0">
        <PWAInstallButton />
        <button
          type="button"
          onClick={onOpenExport}
          className="inline-flex items-center gap-2 rounded-md bg-[var(--pg-accent)] px-4 py-2 text-xs font-semibold text-[var(--pg-accent-ink)] hover:opacity-90 active:scale-[0.98] transition-all whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Export</span>
        </button>
      </div>
    </header>
  );
};
