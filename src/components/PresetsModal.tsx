import React, { useState } from 'react';
import { Check, Plus, RotateCcw, Trash2 } from 'lucide-react';
import type { RenderSettings, StudioPreset } from '../types/studio';
import { Button, ModalShell, SectionHeading } from './ui/Modal';

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
    <ModalShell
      title="Presets"
      subtitle="Save this look, or recall one you saved. Presets live in this browser."
      onClose={onClose}
      closeLabel="Close presets"
      toolbar={
        <form onSubmit={handleCreate} className="flex items-center gap-2 px-4 py-2.5 sm:px-5">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Name this look…"
            aria-label="New preset name"
            className="min-h-[40px] min-w-0 flex-1 rounded-md border border-[var(--pg-border-strong)] bg-[var(--pg-surface)] px-3 py-2 text-xs text-[var(--pg-text)] placeholder:text-[var(--pg-muted)]/70 focus:border-[var(--pg-accent)] focus:outline-none"
          />
          <Button type="submit" variant="primary" disabled={!newName.trim()}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Save preset</span>
            <span className="sm:hidden">Save</span>
          </Button>
        </form>
      }
      footer={
        <>
          <Button variant="ghost" onClick={onResetDefaults} className="mr-auto px-0">
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Reset all</span>
          </Button>
          <Button onClick={onClose}>Done</Button>
        </>
      }
    >
      <div className="divide-y divide-[var(--pg-border)]">
        {presets.map((preset) => (
          <div
            key={preset.id}
            className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-[var(--pg-elevated)]/40 sm:px-5"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium text-[var(--pg-text)]">
                  {preset.name}
                </span>
                {preset.isBuiltIn ? (
                  <span className="shrink-0 rounded border border-[var(--pg-border)] px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-[var(--pg-muted)]">
                    Built-in
                  </span>
                ) : null}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 font-mono-grid text-[11px] text-[var(--pg-muted)]">
                <span>{preset.settings.mode}</span>
                <span aria-hidden="true">·</span>
                <span>{preset.settings.ditherAlgorithm}</span>
                <span aria-hidden="true">·</span>
                <span>{preset.settings.colorMode}</span>
                <span aria-hidden="true">·</span>
                <span>{preset.settings.columns} cols</span>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {!preset.isBuiltIn && (
                <button
                  type="button"
                  onClick={() => onDeletePreset(preset.id)}
                  className="pg-tap flex h-9 w-9 items-center justify-center rounded-md border border-[var(--pg-border)] text-[var(--pg-muted)] transition-colors hover:border-[var(--pg-danger)]/45 hover:text-[var(--pg-danger)]"
                  aria-label={`Delete preset ${preset.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
              <Button
                size="sm"
                variant={appliedId === preset.id ? 'primary' : 'secondary'}
                onClick={() => {
                  onApplyPreset(preset.settings);
                  setAppliedId(preset.id);
                  setTimeout(() => setAppliedId(null), 1200);
                }}
                className="min-w-[82px]"
              >
                {appliedId === preset.id ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    <span>Applied</span>
                  </>
                ) : (
                  <span>Apply</span>
                )}
              </Button>
            </div>
          </div>
        ))}

        {presets.length === 0 && (
          <div className="px-5 py-10 text-center">
            <SectionHeading className="justify-center">No presets yet</SectionHeading>
            <p className="mt-1 text-xs text-[var(--pg-muted)]">
              Save a snapshot above to reuse this look. Presets live in this browser.
            </p>
          </div>
        )}
      </div>
    </ModalShell>
  );
};
