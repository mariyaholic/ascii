import React, { useState } from 'react';
import { Check, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import type { RenderSettings, StudioPreset } from '../types/studio';

interface PresetsModalProps {
  presets: StudioPreset[];
  currentSettings: RenderSettings;
  onApplyPreset: (settings: RenderSettings) => void;
  onSavePreset: (name: string) => void;
  onDeletePreset: (id: string) => void;
  onResetDefaults: () => void;
  onClose: () => void;
}

export const PresetsModal: React.FC<PresetsModalProps> = ({
  presets,
  onApplyPreset,
  onSavePreset,
  onDeletePreset,
  onResetDefaults,
  onClose,
}) => {
  const [newName, setNewName] = useState('');
  const [appliedId, setAppliedId] = useState<string | null>(null);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    onSavePreset(newName.trim());
    setNewName('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
      <div className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-lg border border-[var(--pg-border-strong)] bg-[var(--pg-surface)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--pg-border)] px-5 py-3.5">
          <div>
            <h2 className="font-display text-base font-semibold text-[var(--pg-text)]">
              Studio Presets
            </h2>
            <p className="text-xs text-[var(--pg-muted)]">
              Save current render, dither, and color recipes offline or recall curated styles.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded text-[var(--pg-muted)] hover:bg-[var(--pg-elevated)] hover:text-[var(--pg-text)] cursor-pointer"
            aria-label="Close presets"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form
          onSubmit={handleCreate}
          className="flex items-center gap-2 border-b border-[var(--pg-border)] bg-[var(--pg-well)] px-5 py-3"
        >
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Name current settings snapshot..."
            className="flex-1 rounded-md border border-[var(--pg-border-strong)] bg-[var(--pg-surface)] px-3 py-2 text-xs text-[var(--pg-text)] focus:border-[var(--pg-accent)] focus:outline-none"
          />
          <button
            type="submit"
            disabled={!newName.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-[var(--pg-accent)] px-3.5 py-2 text-xs font-semibold text-[var(--pg-accent-ink)] disabled:opacity-40 cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Save Preset</span>
          </button>
        </form>

        <div className="flex-1 overflow-y-auto pg-scroll divide-y divide-[var(--pg-border)]">
          {presets.map((preset) => (
            <div
              key={preset.id}
              className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-[var(--pg-elevated)]/40 transition-colors"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-[var(--pg-text)]">
                    {preset.name}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-[var(--pg-muted)] font-mono-grid">
                  <span>{preset.settings.mode}</span>
                  <span aria-hidden="true">·</span>
                  <span>{preset.settings.ditherAlgorithm}</span>
                  <span aria-hidden="true">·</span>
                  <span>{preset.settings.colorMode}</span>
                  <span aria-hidden="true">·</span>
                  <span>{preset.settings.columns} cols</span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {!preset.isBuiltIn && (
                  <button
                    type="button"
                    onClick={() => onDeletePreset(preset.id)}
                    className="flex h-8 w-8 items-center justify-center rounded border border-[var(--pg-border)] text-[var(--pg-muted)] hover:border-red-500/40 hover:text-red-300 cursor-pointer"
                    aria-label={`Delete preset ${preset.name}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    onApplyPreset(preset.settings);
                    setAppliedId(preset.id);
                    setTimeout(() => setAppliedId(null), 1200);
                  }}
                  className="inline-flex min-w-[76px] items-center justify-center gap-1.5 rounded-md border border-[var(--pg-border-strong)] bg-[var(--pg-well)] px-3 py-1.5 text-xs font-medium text-[var(--pg-text)] hover:border-[var(--pg-accent)] hover:text-[var(--pg-accent)] cursor-pointer"
                >
                  {appliedId === preset.id ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-[var(--pg-accent)]" />
                      <span>Applied</span>
                    </>
                  ) : (
                    <span>Apply</span>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-[var(--pg-border)] bg-[var(--pg-well)] px-5 py-3">
          <button
            type="button"
            onClick={onResetDefaults}
            className="inline-flex items-center gap-1.5 text-xs text-[var(--pg-muted)] hover:text-[var(--pg-text)] cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Reset to Factory Defaults</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[var(--pg-border-strong)] bg-[var(--pg-surface)] px-4 py-1.5 text-xs font-medium text-[var(--pg-text)] hover:border-[var(--pg-accent)] cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
