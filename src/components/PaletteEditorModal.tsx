import React, { useState } from 'react';
import { ArrowDownUp, CopyPlus, Plus, Trash2, Upload, X } from 'lucide-react';
import { hexToRgb, relativeLuminance } from '../engine/imageProcessor';
import type { PaletteDefinition } from '../types/studio';
import { Button, ModalShell } from './ui/Modal';

interface PaletteEditorModalProps {
  palettes: PaletteDefinition[];
  activePaletteId: string;
  onSelectPalette: (id: string) => void;
  onSavePalette: (palette: PaletteDefinition) => void;
  onDeletePalette: (id: string) => void;
  onClose: () => void;
}

export const PaletteEditorModal: React.FC<PaletteEditorModalProps> = ({
  palettes,
  activePaletteId,
  onSelectPalette,
  onSavePalette,
  onDeletePalette,
  onClose,
}) => {
  const initial = palettes.find((p) => p.id === activePaletteId) ?? palettes[0];
  const [selectedId, setSelectedId] = useState<string>(initial.id);
  const current = palettes.find((p) => p.id === selectedId) ?? palettes[0];

  const [draftName, setDraftName] = useState<string>(current.name);
  const [draftColors, setDraftColors] = useState<string[]>(current.colors);
  const [jsonInput, setJsonInput] = useState<string>('');
  const [importError, setImportError] = useState<string | null>(null);

  const loadPaletteIntoDraft = (pal: PaletteDefinition) => {
    setSelectedId(pal.id);
    setDraftName(pal.name);
    setDraftColors([...pal.colors]);
    setImportError(null);
  };

  const handleDuplicateAsCustom = () => {
    const newId = `custom-pal-${Date.now()}`;
    const newPal: PaletteDefinition = {
      id: newId,
      name: `${current.name} Copy`,
      isBuiltIn: false,
      colors: [...draftColors],
    };
    onSavePalette(newPal);
    onSelectPalette(newId);
    loadPaletteIntoDraft(newPal);
  };

  const handleCreateBlank = () => {
    const newId = `custom-pal-${Date.now()}`;
    const newPal: PaletteDefinition = {
      id: newId,
      name: 'New Custom Palette',
      isBuiltIn: false,
      colors: ['#060907', '#1C542B', '#33FF66', '#E6FFF0'],
    };
    onSavePalette(newPal);
    onSelectPalette(newId);
    loadPaletteIntoDraft(newPal);
  };

  const commitEdits = (nextColors: string[], nextName = draftName) => {
    setDraftColors(nextColors);
    setDraftName(nextName);
    if (!current.isBuiltIn) {
      onSavePalette({
        id: current.id,
        name: nextName.trim() || 'Untitled Palette',
        isBuiltIn: false,
        colors: nextColors,
      });
    }
  };

  const handleSortByLuminance = () => {
    const sorted = [...draftColors].sort((a, b) => {
      const [ar, ag, ab] = hexToRgb(a);
      const [br, bg, bb] = hexToRgb(b);
      return relativeLuminance(ar, ag, ab) - relativeLuminance(br, bg, bb);
    });
    commitEdits(sorted);
  };

  const handleImportJson = () => {
    try {
      const parsed = JSON.parse(jsonInput);
      const arr = Array.isArray(parsed) ? parsed : parsed?.colors;
      if (!Array.isArray(arr) || arr.length < 2) {
        setImportError('Provide a JSON array of at least 2 hex colors.');
        return;
      }
      const valid = arr
        .map((c) => String(c).trim())
        .filter((c) => /^#?[0-9A-Fa-f]{3,6}$/.test(c))
        .map((c) => (c.startsWith('#') ? c.toUpperCase() : `#${c.toUpperCase()}`));
      if (valid.length < 2) {
        setImportError('No valid hex color codes found.');
        return;
      }
      const newId = `custom-pal-${Date.now()}`;
      const newPal: PaletteDefinition = {
        id: newId,
        name: typeof parsed?.name === 'string' && parsed.name.trim() ? parsed.name.trim() : 'Imported Palette',
        isBuiltIn: false,
        colors: valid,
      };
      onSavePalette(newPal);
      onSelectPalette(newId);
      loadPaletteIntoDraft(newPal);
      setJsonInput('');
      setImportError(null);
    } catch {
      setImportError('Invalid JSON format.');
    }
  };

  return (
    <ModalShell
      title="Palettes"
      subtitle="Choose a hardware palette or build your own."
      size="lg"
      onClose={onClose}
      closeLabel="Close palette studio"
      bodyClassName="p-0"
    >
        <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] divide-y md:divide-y-0 md:divide-x divide-[var(--pg-border)]">
          {/* Left Palette List */}
          <div className="flex flex-col min-h-0 bg-[var(--pg-well)]">
            <div className="p-3 border-b border-[var(--pg-border)]">
              <button
                type="button"
                onClick={handleCreateBlank}
                className="flex w-full items-center justify-center gap-1.5 rounded-md bg-[var(--pg-accent)] px-3 py-2 text-xs font-semibold text-[var(--pg-accent-ink)] hover:opacity-90 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>New palette</span>
              </button>
            </div>
            <div className="max-h-[32dvh] overflow-y-auto pg-scroll pg-sheet-body p-2 space-y-1 md:max-h-none">
              {palettes.map((pal) => {
                const isSelected = pal.id === current.id;
                const isActiveOnCanvas = pal.id === activePaletteId;
                return (
                  <button
                    key={pal.id}
                    type="button"
                    onClick={() => {
                      loadPaletteIntoDraft(pal);
                      onSelectPalette(pal.id);
                    }}
                    className={`w-full rounded-md px-3 py-2 text-left transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[var(--pg-elevated)] border border-[var(--pg-accent)]'
                        : 'border border-transparent hover:bg-[var(--pg-surface)]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-medium text-[var(--pg-text)]">
                        {pal.name}
                      </span>
                      <span className="font-mono-grid text-[11px] text-[var(--pg-muted)]">
                        {isActiveOnCanvas ? 'Active' : `${pal.colors.length}c`}
                      </span>
                    </div>
                    <div className="mt-1.5 flex h-2 w-full overflow-hidden rounded-xs">
                      {pal.colors.map((c, idx) => (
                        <div key={`${c}-${idx}`} className="flex-1" style={{ backgroundColor: c }} />
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Swatch Editor */}
          <div className="flex flex-col min-h-0 overflow-y-auto pg-scroll p-5 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {current.isBuiltIn ? (
                <div>
                  <h3 className="text-sm font-semibold text-[var(--pg-text)]">{current.name}</h3>
                  <p className="text-xs text-[var(--pg-muted)]">
                    Built-in and read-only. Duplicate it to edit the swatches.
                  </p>
                </div>
              ) : (
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs text-[var(--pg-muted)] mb-1">Name</label>
                  <input
                    type="text"
                    value={draftName}
                    onChange={(e) => commitEdits(draftColors, e.target.value)}
                    className="w-full rounded-md border border-[var(--pg-border-strong)] bg-[var(--pg-well)] px-3 py-1.5 text-sm text-[var(--pg-text)] focus:border-[var(--pg-accent)] focus:outline-none"
                  />
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDuplicateAsCustom}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[var(--pg-border-strong)] bg-[var(--pg-well)] px-3 py-1.5 text-xs font-medium text-[var(--pg-text)] hover:border-[var(--pg-accent)] cursor-pointer"
                >
                  <CopyPlus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Duplicate</span>
                </button>
                {!current.isBuiltIn && (
                  <button
                    type="button"
                    onClick={() => {
                      onDeletePalette(current.id);
                      const fallback = palettes.find((p) => p.id !== current.id) ?? palettes[0];
                      loadPaletteIntoDraft(fallback);
                    }}
                    className="inline-flex min-h-[34px] items-center gap-1.5 rounded-md border border-[var(--pg-danger)]/45 bg-[var(--pg-danger-soft)] px-3 py-1.5 text-xs font-medium text-[var(--pg-danger)] hover:border-[var(--pg-danger)] cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Delete</span>
                  </button>
                )}
              </div>
            </div>

            {/* Swatch Grid */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[var(--pg-muted)]">
                  Swatches ({draftColors.length})
                </span>
                {!current.isBuiltIn && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSortByLuminance}
                      className="inline-flex items-center gap-1 rounded border border-[var(--pg-border)] bg-[var(--pg-well)] px-2.5 py-1 text-xs text-[var(--pg-muted)] hover:text-[var(--pg-text)] cursor-pointer"
                    >
                      <ArrowDownUp className="w-3 h-3" aria-hidden="true" />
                      <span>Sort by luminance</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => commitEdits([...draftColors, '#33FF66'])}
                      className="inline-flex items-center gap-1 rounded border border-[var(--pg-accent)] bg-[var(--pg-accent-soft)] px-2.5 py-1 text-xs font-medium text-[var(--pg-accent)] cursor-pointer"
                    >
                      <Plus className="w-3 h-3" aria-hidden="true" />
                      <span>Add swatch</span>
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {draftColors.map((hex, index) => (
                  <div
                    key={`${index}-${hex}`}
                    className="flex items-center gap-2 rounded-md border border-[var(--pg-border)] bg-[var(--pg-well)] p-2"
                  >
                    <input
                      type="color"
                      value={hex}
                      disabled={current.isBuiltIn}
                      onChange={(e) => {
                        const next = [...draftColors];
                        next[index] = e.target.value.toUpperCase();
                        commitEdits(next);
                      }}
                      className="h-7 w-7 shrink-0 cursor-pointer rounded border-0 bg-transparent disabled:cursor-default"
                    />
                    <input
                      type="text"
                      value={hex}
                      disabled={current.isBuiltIn}
                      onChange={(e) => {
                        const next = [...draftColors];
                        next[index] = e.target.value.toUpperCase();
                        commitEdits(next);
                      }}
                      className="min-w-0 flex-1 bg-transparent font-mono-grid text-xs text-[var(--pg-text)] focus:outline-none disabled:opacity-80"
                    />
                    {!current.isBuiltIn && draftColors.length > 2 && (
                      <button
                        type="button"
                        onClick={() => commitEdits(draftColors.filter((_, i) => i !== index))}
                        className="pg-tap flex h-8 w-8 items-center justify-center rounded text-[var(--pg-muted)] transition-colors hover:text-[var(--pg-danger)]"
                        aria-label={`Remove color ${hex}`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* JSON Import / Export */}
            <div className="space-y-2 border-t border-[var(--pg-border)] pt-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[var(--pg-muted)]">
                  Import JSON
                </span>
                <button
                  type="button"
                  onClick={() =>
                    navigator.clipboard?.writeText(
                      JSON.stringify({ name: draftName, colors: draftColors }, null, 2)
                    )
                  }
                  className="text-xs text-[var(--pg-accent)] hover:underline cursor-pointer"
                >
                  Copy as JSON
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={jsonInput}
                  onChange={(e) => setJsonInput(e.target.value)}
                  placeholder='Paste ["#000000", "#33FF66", ...]'
                  className="flex-1 rounded-md border border-[var(--pg-border-strong)] bg-[var(--pg-well)] px-3 py-1.5 font-mono-grid text-xs text-[var(--pg-text)] focus:border-[var(--pg-accent)] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleImportJson}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[var(--pg-border-strong)] bg-[var(--pg-elevated)] px-3 py-1.5 text-xs font-medium text-[var(--pg-text)] hover:border-[var(--pg-accent)] cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Import</span>
                </button>
              </div>
              {importError && <p className="text-xs text-[var(--pg-danger)]">{importError}</p>}
            </div>
          </div>
        </div>
    </ModalShell>
  );
};
