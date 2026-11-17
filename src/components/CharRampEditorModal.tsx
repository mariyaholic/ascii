import React, { useState } from 'react';
import { ArrowLeftRight, CopyPlus, Plus, Trash2 } from 'lucide-react';
import type { CharRampDefinition } from '../types/studio';
import { ModalShell } from './ui/Modal';

interface CharRampEditorModalProps {
  charRamps: CharRampDefinition[];
  activeRampId: string;
  onSelectRamp: (id: string) => void;
  onSaveRamp: (ramp: CharRampDefinition) => void;
  onDeleteRamp: (id: string) => void;
  onClose: () => void;
}

const UNICODE_GLYPH_BANKS: ReadonlyArray<{ label: string; glyphs: string[] }> = [
  { label: 'Shade Blocks', glyphs: [' ', '░', '▒', '▓', '█', '▀', '▄', '▌', '▐'] },
  { label: 'Geometric', glyphs: ['·', '∘', '○', '◎', '●', '◉', '▪', '▫', '■', '□', '◆', '◇'] },
  { label: 'Box Lines', glyphs: ['─', '│', '┌', '┐', '└', '┘', '┼', '╬', '═', '║'] },
  { label: 'Classic ASCII', glyphs: ['.', ':', '-', '=', '+', '*', '#', '%', '@', '$'] },
];

export const CharRampEditorModal: React.FC<CharRampEditorModalProps> = ({
  charRamps,
  activeRampId,
  onSelectRamp,
  onSaveRamp,
  onDeleteRamp,
  onClose,
}) => {
  const initial = charRamps.find((r) => r.id === activeRampId) ?? charRamps[0];
  const [selectedId, setSelectedId] = useState<string>(initial.id);
  const current = charRamps.find((r) => r.id === selectedId) ?? charRamps[0];

  const [draftName, setDraftName] = useState<string>(current.name);
  const [draftChars, setDraftChars] = useState<string>(current.chars);

  const loadRampIntoDraft = (ramp: CharRampDefinition) => {
    setSelectedId(ramp.id);
    setDraftName(ramp.name);
    setDraftChars(ramp.chars);
  };

  const handleCreateCustom = (baseChars = ' .:-=+*#%@', baseName = 'Custom Unicode Ramp') => {
    const newId = `custom-ramp-${Date.now()}`;
    const next: CharRampDefinition = {
      id: newId,
      name: baseName,
      isBuiltIn: false,
      chars: baseChars,
    };
    onSaveRamp(next);
    onSelectRamp(newId);
    loadRampIntoDraft(next);
  };

  const commitEdits = (nextChars: string, nextName = draftName) => {
    setDraftChars(nextChars);
    setDraftName(nextName);
    if (!current.isBuiltIn) {
      onSaveRamp({
        id: current.id,
        name: nextName.trim() || 'Untitled Ramp',
        isBuiltIn: false,
        chars: nextChars,
      });
    }
  };

  const reverseRamp = () => {
    const reversed = Array.from(draftChars).reverse().join('');
    commitEdits(reversed);
  };

  const glyphArray = Array.from(draftChars);

  return (
    <ModalShell
      title="Character ramps"
      subtitle="Ordered darkest to brightest, left to right."
      size="lg"
      onClose={onClose}
      closeLabel="Close character ramp editor"
      bodyClassName="p-0"
    >
        <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] divide-y md:divide-y-0 md:divide-x divide-[var(--pg-border)]">
          {/* Left Ramp Selector */}
          <div className="flex flex-col min-h-0 bg-[var(--pg-well)]">
            <div className="p-3 border-b border-[var(--pg-border)]">
              <button
                type="button"
                onClick={() => handleCreateCustom()}
                className="flex w-full items-center justify-center gap-1.5 rounded-md bg-[var(--pg-accent)] px-3 py-2 text-xs font-semibold text-[var(--pg-accent-ink)] hover:opacity-90 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>New ramp</span>
              </button>
            </div>
            <div className="max-h-[32dvh] overflow-y-auto pg-scroll pg-sheet-body p-2 space-y-1 md:max-h-none">
              {charRamps.map((ramp) => {
                const isSelected = ramp.id === current.id;
                const isActive = ramp.id === activeRampId;
                return (
                  <button
                    key={ramp.id}
                    type="button"
                    onClick={() => {
                      loadRampIntoDraft(ramp);
                      onSelectRamp(ramp.id);
                    }}
                    className={`w-full rounded-md px-3 py-2 text-left transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[var(--pg-elevated)] border border-[var(--pg-accent)]'
                        : 'border border-transparent hover:bg-[var(--pg-surface)]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-medium text-[var(--pg-text)]">
                        {ramp.name}
                      </span>
                      <span className="font-mono-grid text-[11px] text-[var(--pg-muted)]">
                        {isActive ? 'Active' : `${Array.from(ramp.chars).length}`}
                      </span>
                    </div>
                    <div className="mt-1 truncate font-mono-grid text-xs text-[var(--pg-muted)]">
                      {ramp.chars}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Editor */}
          <div className="flex flex-col min-h-0 overflow-y-auto pg-scroll p-5 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {current.isBuiltIn ? (
                <div>
                  <h3 className="text-sm font-semibold text-[var(--pg-text)]">{current.name}</h3>
                  <p className="text-xs text-[var(--pg-muted)]">
                    Built-in and read-only. Duplicate it to reorder the glyphs.
                  </p>
                </div>
              ) : (
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs text-[var(--pg-muted)] mb-1">Name</label>
                  <input
                    type="text"
                    value={draftName}
                    onChange={(e) => commitEdits(draftChars, e.target.value)}
                    className="w-full rounded-md border border-[var(--pg-border-strong)] bg-[var(--pg-well)] px-3 py-1.5 text-sm text-[var(--pg-text)] focus:border-[var(--pg-accent)] focus:outline-none"
                  />
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleCreateCustom(draftChars, `${current.name} Copy`)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[var(--pg-border-strong)] bg-[var(--pg-well)] px-3 py-1.5 text-xs font-medium text-[var(--pg-text)] hover:border-[var(--pg-accent)] cursor-pointer"
                >
                  <CopyPlus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Duplicate</span>
                </button>
                {!current.isBuiltIn && (
                  <button
                    type="button"
                    onClick={() => {
                      onDeleteRamp(current.id);
                      const fallback = charRamps.find((r) => r.id !== current.id) ?? charRamps[0];
                      loadRampIntoDraft(fallback);
                    }}
                    className="inline-flex min-h-[34px] items-center gap-1.5 rounded-md border border-[var(--pg-danger)]/45 bg-[var(--pg-danger-soft)] px-3 py-1.5 text-xs font-medium text-[var(--pg-danger)] hover:border-[var(--pg-danger)] cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Delete</span>
                  </button>
                )}
              </div>
            </div>

            {/* Editable String */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-[var(--pg-muted)]">
                  Glyphs ({glyphArray.length})
                </label>
                {!current.isBuiltIn && (
                  <button
                    type="button"
                    onClick={reverseRamp}
                    className="inline-flex items-center gap-1 rounded border border-[var(--pg-border)] bg-[var(--pg-well)] px-2.5 py-1 text-xs text-[var(--pg-muted)] hover:text-[var(--pg-text)] cursor-pointer"
                  >
                    <ArrowLeftRight className="w-3 h-3" aria-hidden="true" />
                    <span>Reverse</span>
                  </button>
                )}
              </div>
              <input
                type="text"
                value={draftChars}
                disabled={current.isBuiltIn}
                onChange={(e) => commitEdits(e.target.value)}
                className="w-full rounded-md border border-[var(--pg-border-strong)] bg-[var(--pg-well)] px-3 py-2.5 font-mono-grid text-base tracking-widest text-[var(--pg-accent)] focus:border-[var(--pg-accent)] focus:outline-none disabled:opacity-80"
              />
            </div>

            {/* Live Density Gradient Strip */}
            <div className="space-y-1.5">
              <span className="block text-xs font-medium text-[var(--pg-muted)]">
                Density
              </span>
              <div className="flex overflow-x-auto rounded-md border border-[var(--pg-border)] bg-black p-3 font-mono-grid text-lg leading-none text-[var(--pg-accent)]">
                {glyphArray.map((ch, idx) => (
                  <span
                    key={`${idx}-${ch}`}
                    className="inline-flex h-8 w-6 shrink-0 items-center justify-center border-r border-[var(--pg-border)]/40 last:border-r-0"
                  >
                    {ch === ' ' ? '·' : ch}
                  </span>
                ))}
              </div>
            </div>

            {/* Quick-Insert Unicode Glyph Palette */}
            {!current.isBuiltIn && (
              <div className="space-y-3 border-t border-[var(--pg-border)] pt-4">
                <span className="block text-xs font-medium text-[var(--pg-muted)]">
                  Insert a glyph
                </span>
                <div className="space-y-2.5">
                  {UNICODE_GLYPH_BANKS.map((bank) => (
                    <div key={bank.label} className="space-y-1">
                      <span className="text-[11px] text-[var(--pg-muted)]">{bank.label}</span>
                      <div className="flex flex-wrap gap-1.5">
                        {bank.glyphs.map((g) => (
                          <button
                            key={g}
                            type="button"
                            onClick={() => commitEdits(draftChars + g)}
                            className="pg-tap flex h-9 w-9 items-center justify-center rounded border border-[var(--pg-border-strong)] bg-[var(--pg-well)] font-mono-grid text-sm text-[var(--pg-text)] transition-colors hover:border-[var(--pg-accent)] hover:text-[var(--pg-accent)]"
                            title={`Append "${g}"`}
                          >
                            {g === ' ' ? '␣' : g}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
    </ModalShell>
  );
};
