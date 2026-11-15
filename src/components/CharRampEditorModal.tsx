import React, { useState } from 'react';
import { ArrowLeftRight, CopyPlus, Plus, Trash2, X } from 'lucide-react';
import type { CharRampDefinition } from '../types/studio';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-[var(--pg-border-strong)] bg-[var(--pg-surface)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--pg-border)] px-5 py-3.5">
          <div>
            <h2 className="font-display text-base font-semibold text-[var(--pg-text)]">
              ASCII &amp; Unicode Character Ramp Editor
            </h2>
            <p className="text-xs text-[var(--pg-muted)]">
              Ordered from darkest/sparsest (left) to brightest/densest (right).
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded text-[var(--pg-muted)] hover:bg-[var(--pg-elevated)] hover:text-[var(--pg-text)] cursor-pointer"
            aria-label="Close character ramp editor"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid flex-1 min-h-0 grid-cols-1 md:grid-cols-[240px_1fr] divide-y md:divide-y-0 md:divide-x divide-[var(--pg-border)]">
          {/* Left Ramp Selector */}
          <div className="flex flex-col min-h-0 bg-[var(--pg-well)]">
            <div className="p-3 border-b border-[var(--pg-border)]">
              <button
                type="button"
                onClick={() => handleCreateCustom()}
                className="flex w-full items-center justify-center gap-1.5 rounded-md bg-[var(--pg-accent)] px-3 py-2 text-xs font-semibold text-[var(--pg-accent-ink)] hover:opacity-90 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>New Custom Ramp</span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto pg-scroll p-2 space-y-1">
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
                    Built-in character set. Duplicate to customize glyph order.
                  </p>
                </div>
              ) : (
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs text-[var(--pg-muted)] mb-1">Ramp Name</label>
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
                    className="inline-flex items-center gap-1.5 rounded-md border border-red-500/40 bg-[var(--pg-well)] px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-950/40 cursor-pointer"
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
                  Character Sequence ({glyphArray.length} glyphs)
                </label>
                {!current.isBuiltIn && (
                  <button
                    type="button"
                    onClick={reverseRamp}
                    className="inline-flex items-center gap-1 rounded border border-[var(--pg-border)] bg-[var(--pg-well)] px-2.5 py-1 text-xs text-[var(--pg-muted)] hover:text-[var(--pg-text)] cursor-pointer"
                  >
                    <ArrowLeftRight className="w-3 h-3" aria-hidden="true" />
                    <span>Reverse Order</span>
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
                Density Gradient Preview
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
                  Quick-Insert Unicode Glyphs
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
                            className="flex h-8 w-8 items-center justify-center rounded border border-[var(--pg-border-strong)] bg-[var(--pg-well)] font-mono-grid text-sm text-[var(--pg-text)] hover:border-[var(--pg-accent)] hover:text-[var(--pg-accent)] cursor-pointer"
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
      </div>
    </div>
  );
};
