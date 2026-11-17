import React from 'react';
import { Download } from 'lucide-react';
import type { WorkspaceSection } from '../types/studio';
import { Button } from './ui/Modal';
import { PWAInstallButton } from './PWAInstallButton';

interface StudioHeaderProps {
  activeSection: WorkspaceSection;
  /** Export has no empty state, so the action is disabled until a render exists. */
  canExport: boolean;
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
  canExport,
  onSelectSection,
  onOpenExport,
}) => {
  return (
    <header className="pg-safe-top pg-safe-x sticky top-0 z-30 flex min-h-14 shrink-0 items-center justify-between gap-4 border-b border-[var(--pg-border)] bg-[var(--pg-surface)] px-4 lg:gap-8 lg:px-6">
      {/* Zone 1: single-element brand wordmark */}
      <a
        href="#studio"
        onClick={(event) => {
          event.preventDefault();
          onSelectSection('studio');
        }}
        className="font-display shrink-0 whitespace-nowrap text-lg font-bold tracking-tight text-[var(--pg-text)] transition-colors hover:text-[var(--pg-accent)]"
      >
        PhosphorGrid
      </a>

      {/* Zone 2: single-line workspace navigation */}
      <nav className="hidden items-center gap-6 md:flex" aria-label="Workspace navigation">
        {NAV_ITEMS.map((item) => {
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectSection(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`pg-tap relative shrink-0 whitespace-nowrap py-1 text-sm font-medium transition-colors ${
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

      {/* Zone 3: primary export action (+ conditional install affordance) */}
      <div className="flex shrink-0 items-center gap-2">
        <PWAInstallButton />
        <Button
          variant="primary"
          onClick={onOpenExport}
          disabled={!canExport}
          title={canExport ? 'Export artwork' : 'Load an image to export'}
          className="shrink-0"
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Export</span>
        </Button>
      </div>
    </header>
  );
};
