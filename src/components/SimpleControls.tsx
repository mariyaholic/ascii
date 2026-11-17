import React, { useState } from 'react';
import { Loader2, RotateCcw, Sparkles, Undo2, Wand2 } from 'lucide-react';
import type { PhosphorTheme, RenderSettings } from '../types/studio';

interface SimpleControlsProps {
  settings: RenderSettings;
  phosphorTheme: PhosphorTheme;
  isAutoTuning: boolean;
  tuneSummary: string | null;
  tuneSource: 'api' | 'local' | null;
  tuneError: string | null;
  canUndoTune: boolean;
  onUpdateSettings: (patch: Partial<RenderSettings>) => void;
  onChangePhosphorTheme: (theme: PhosphorTheme) => void;
  onAutoTune: (goalPrompt?: string) => void;
  onUndoTune: () => void;
  onResetDefaults: () => void;
}

interface QuickLookCard {
  id: string;
  title: string;
  subtitle: string;
  patch: Partial<RenderSettings>;
  theme?: PhosphorTheme;
}

const QUICK_LOOKS: ReadonlyArray<QuickLookCard> = [
  {
    id: 'green-terminal',
    title: 'Green Terminal',
    subtitle: 'Glowing CRT text',
    theme: 'p31',
    patch: {
      mode: 'ascii',
      cellAspectRatio: 0.52,
      charRampId: 'ascii-standard',
      ditherAlgorithm: 'bayer8',
      ditherStrength: 65,
      colorMode: 'mono',
      monoForeground: '#33FF66',
      backgroundColor: '#050806',
      contrast: 12,
      edgeBoost: 15,
      blurRadius: 0,
      posterizeLevels: 0,
      crtOverlay: true,
    },
  },
  {
    id: 'ink-sketch',
    title: 'Ink & Paper',
    subtitle: 'Crisp stipple print',
    theme: 'p4',
    patch: {
      mode: 'braille',
      cellAspectRatio: 0.5,
      ditherAlgorithm: 'atkinson',
      ditherStrength: 90,
      colorMode: 'mono',
      monoForeground: '#EEF5F0',
      backgroundColor: '#070A08',
      contrast: 20,
      edgeBoost: 20,
      blurRadius: 0,
      posterizeLevels: 0,
      crtOverlay: false,
    },
  },
  {
    id: 'retro-pixel',
    title: 'Retro Pixel',
    subtitle: '16-color arcade grid',
    patch: {
      mode: 'pixel',
      cellAspectRatio: 1.0,
      ditherAlgorithm: 'bayer8',
      ditherStrength: 75,
      colorMode: 'palette',
      paletteId: 'pico-8',
      contrast: 10,
      edgeBoost: 0,
      blurRadius: 0,
      posterizeLevels: 0,
      crtOverlay: false,
    },
  },
  {
    id: 'shaded-blocks',
    title: 'Shaded Blocks',
    subtitle: 'Warm amber blocks',
    theme: 'p3',
    patch: {
      mode: 'ascii',
      cellAspectRatio: 0.52,
      charRampId: 'unicode-blocks',
      ditherAlgorithm: 'floyd-steinberg',
      ditherStrength: 75,
      colorMode: 'palette',
      paletteId: 'p3-amber',
      monoForeground: '#FFB000',
      backgroundColor: '#080602',
      contrast: 10,
      edgeBoost: 10,
      blurRadius: 0,
      posterizeLevels: 0,
      crtOverlay: true,
    },
  },
  {
    id: 'smooth-photo',
    title: 'True-Color Grid',
    subtitle: 'Crisp color display',
    patch: {
      mode: 'halfblock',
      cellAspectRatio: 0.5,
      ditherAlgorithm: 'bayer4',
      ditherStrength: 40,
      colorMode: 'truecolor',
      contrast: 8,
      edgeBoost: 5,
      blurRadius: 0,
      posterizeLevels: 16,
      crtOverlay: false,
    },
  },
  {
    id: 'bold-stencil',
    title: 'Bold Stencil',
    subtitle: 'Clean simplified art',
    patch: {
      mode: 'pixel',
      cellAspectRatio: 1.0,
      ditherAlgorithm: 'none',
      ditherStrength: 0,
      colorMode: 'palette',
      paletteId: 'dmg-gameboy',
      blurRadius: 1,
      posterizeLevels: 4,
      contrast: 22,
      edgeBoost: 15,
      crtOverlay: false,
    },
  },
];

const QUICK_GOALS: ReadonlyArray<string> = [
  'Newspaper print',
  'Game Boy handheld',
  'Soft portrait shading',
  'Bold flat stencil',
];

export const SimpleControls: React.FC<SimpleControlsProps> = ({
  settings,
  isAutoTuning,
  tuneSummary,
  tuneSource,
  tuneError,
  canUndoTune,
  onUpdateSettings,
  onChangePhosphorTheme,
  onAutoTune,
  onUndoTune,
  onResetDefaults,
}) => {
  const [goalInput, setGoalInput] = useState('');

  // Map human-friendly "Simplification" slider (0..5) to blur + posterize
  const simplicityLevel =
    settings.blurRadius >= 2
      ? 4
      : settings.blurRadius === 1
      ? 3
      : settings.posterizeLevels > 0 && settings.posterizeLevels <= 6
      ? 2
      : settings.posterizeLevels > 6
      ? 1
      : 0;

  const handleSimplicityChange = (level: number) => {
    if (level === 0) {
      onUpdateSettings({ blurRadius: 0, posterizeLevels: 0 });
    } else if (level === 1) {
      onUpdateSettings({ blurRadius: 0, posterizeLevels: 12 });
    } else if (level === 2) {
      onUpdateSettings({ blurRadius: 0, posterizeLevels: 6 });
    } else if (level === 3) {
      onUpdateSettings({ blurRadius: 1, posterizeLevels: 5 });
    } else {
      onUpdateSettings({ blurRadius: 2, posterizeLevels: 4 });
    }
  };

  // Map human-friendly "Tone Punch" slider (-10..50) to contrast + edgeBoost
  const handleTonePunchChange = (val: number) => {
    const edge = Math.max(0, Math.min(45, Math.round(val * 0.7)));
    onUpdateSettings({ contrast: val, edgeBoost: edge });
  };

  const handleGoalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!goalInput.trim() || isAutoTuning) return;
    onAutoTune(goalInput.trim());
  };

  return (
    <div className="divide-y divide-[var(--pg-border)] text-sm">
      {/* Section 1: Smart Auto-Tune & Plain-English Helper */}
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--pg-text)]">
            Auto-tune
          </h2>
          {canUndoTune && (
            <button
              type="button"
              onClick={onUndoTune}
              className="inline-flex items-center gap-1 text-xs font-medium text-[var(--pg-accent)] hover:underline cursor-pointer"
            >
              <Undo2 className="w-3 h-3" aria-hidden="true" />
              <span>Undo</span>
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => onAutoTune()}
          disabled={isAutoTuning}
          className="flex w-full min-h-[40px] items-center justify-center gap-2 rounded-md bg-[var(--pg-accent)] px-4 py-2 text-xs font-semibold text-[var(--pg-accent-ink)] hover:opacity-90 disabled:opacity-60 transition-opacity cursor-pointer"
        >
          {isAutoTuning ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              <span>Analyzing tone and detail…</span>
            </>
          ) : (
            <>
              <Wand2 className="w-4 h-4" aria-hidden="true" />
              <span>Auto-tune this image</span>
            </>
          )}
        </button>

        <form onSubmit={handleGoalSubmit} className="flex gap-1.5">
          <input
            type="text"
            value={goalInput}
            onChange={(e) => setGoalInput(e.target.value)}
            placeholder="Describe a look, e.g. crisp ink sketch"
            className="min-w-0 flex-1 rounded-md border border-[var(--pg-border-strong)] bg-[var(--pg-well)] px-2.5 py-2 text-xs text-[var(--pg-text)] placeholder:text-[var(--pg-muted)]/70 focus:border-[var(--pg-accent)] focus:outline-none"
          />
          <button
            type="submit"
            disabled={isAutoTuning || !goalInput.trim()}
            className="inline-flex items-center gap-1 rounded-md border border-[var(--pg-border-strong)] bg-[var(--pg-elevated)] px-3 py-2 text-xs font-medium text-[var(--pg-text)] hover:border-[var(--pg-accent)] hover:text-[var(--pg-accent)] disabled:opacity-40 cursor-pointer whitespace-nowrap"
          >
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Apply</span>
          </button>
        </form>

        <div className="flex flex-wrap gap-1.5">
          {QUICK_GOALS.map((goal) => (
            <button
              key={goal}
              type="button"
              disabled={isAutoTuning}
              onClick={() => {
                setGoalInput(goal);
                onAutoTune(goal);
              }}
              className="rounded border border-[var(--pg-border)] bg-[var(--pg-well)] px-2 py-1 text-[11px] text-[var(--pg-muted)] hover:border-[var(--pg-accent)] hover:text-[var(--pg-text)] transition-colors cursor-pointer"
            >
              {goal}
            </button>
          ))}
        </div>

        {tuneSummary && (
          <div className="rounded-md border border-[var(--pg-border-strong)] bg-[var(--pg-well)] p-2.5 text-xs leading-relaxed text-[var(--pg-text)]">
            <p>{tuneSummary}</p>
            <span className="mt-1 block text-[11px] text-[var(--pg-muted)]">
              {tuneSource === 'api' ? 'Tuned by the style model' : 'Tuned on this device'}
            </span>
          </div>
        )}

        {tuneError && (
          <p className="text-xs text-[var(--pg-warn)]">{tuneError}</p>
        )}
      </div>

      {/* Section 2: One-Tap Visual Styles */}
      <div className="p-4 space-y-3">
        <h2 className="font-display text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--pg-text)]">
          Quick looks
        </h2>
        <div className="grid grid-cols-2 gap-2">
          {QUICK_LOOKS.map((look) => {
            const isMatch =
              settings.mode === look.patch.mode &&
              settings.ditherAlgorithm === look.patch.ditherAlgorithm &&
              settings.colorMode === look.patch.colorMode;
            return (
              <button
                key={look.id}
                type="button"
                onClick={() => {
                  onUpdateSettings(look.patch);
                  if (look.theme) onChangePhosphorTheme(look.theme);
                }}
                className={`rounded-md border p-2.5 text-left transition-colors cursor-pointer ${
                  isMatch
                    ? 'border-[var(--pg-accent)] bg-[var(--pg-accent-soft)]'
                    : 'border-[var(--pg-border)] bg-[var(--pg-well)] hover:border-[var(--pg-border-strong)]'
                }`}
              >
                <div className="text-xs font-semibold text-[var(--pg-text)]">{look.title}</div>
                <div className="mt-0.5 text-[11px] text-[var(--pg-muted)]">{look.subtitle}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Section 3: 3 Simple Everyday Sliders + Color Mood */}
      <div className="p-4 space-y-4">
        <h2 className="font-display text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--pg-text)]">
          Adjust
        </h2>

        {/* Detail Size */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <label className="text-[var(--pg-muted)] font-medium">Detail</label>
            <span className="font-mono-grid text-[var(--pg-text)]">
              {settings.columns < 68 ? 'Chunky' : settings.columns > 130 ? 'Fine' : 'Balanced'} ({settings.columns})
            </span>
          </div>
          <input
            type="range"
            min={36}
            max={200}
            step={4}
            value={settings.columns}
            onChange={(e) =>
              onUpdateSettings({
                columns: parseInt(e.target.value, 10),
                autoFit: false,
                nativeOneToOne: false,
              })
            }
            className="pg-slider"
          />
        </div>

        {/* Simplification */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <label className="text-[var(--pg-muted)] font-medium">Simplify</label>
            <span className="font-mono-grid text-[var(--pg-text)]">
              {['Detailed', 'Slightly Clean', 'Simplified', 'Smooth', 'Bold Flat'][simplicityLevel]}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={4}
            step={1}
            value={simplicityLevel}
            onChange={(e) => handleSimplicityChange(parseInt(e.target.value, 10))}
            className="pg-slider"
          />
        </div>

        {/* Tone Punch */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <label className="text-[var(--pg-muted)] font-medium">Contrast</label>
            <span className="font-mono-grid text-[var(--pg-text)]">
              {settings.contrast <= 0 ? 'Soft' : settings.contrast >= 30 ? 'Dramatic' : 'Crisp'}
            </span>
          </div>
          <input
            type="range"
            min={-15}
            max={55}
            step={5}
            value={Math.max(-15, Math.min(55, settings.contrast))}
            onChange={(e) => handleTonePunchChange(parseInt(e.target.value, 10))}
            className="pg-slider"
          />
        </div>

        {/* Color Mood */}
        <div className="space-y-1.5">
          <span className="block text-xs font-medium text-[var(--pg-muted)]">Color</span>
          <div className="grid grid-cols-3 gap-1.5">
            <button
              type="button"
              onClick={() => {
                onChangePhosphorTheme('p31');
                onUpdateSettings({
                  colorMode: 'mono',
                  monoForeground: '#33FF66',
                  backgroundColor: '#050806',
                });
              }}
              className={`min-h-[34px] rounded border px-2 text-xs font-medium cursor-pointer ${
                settings.colorMode === 'mono' && settings.monoForeground.toUpperCase() === '#33FF66'
                  ? 'border-[var(--pg-accent)] bg-[var(--pg-accent-soft)] text-[var(--pg-accent)]'
                  : 'border-[var(--pg-border)] bg-[var(--pg-well)] text-[var(--pg-muted)] hover:text-[var(--pg-text)]'
              }`}
            >
              Green CRT
            </button>
            <button
              type="button"
              onClick={() => {
                onChangePhosphorTheme('p3');
                onUpdateSettings({
                  colorMode: 'mono',
                  monoForeground: '#FFB000',
                  backgroundColor: '#080602',
                });
              }}
              className={`min-h-[34px] rounded border px-2 text-xs font-medium cursor-pointer ${
                settings.colorMode === 'mono' && settings.monoForeground.toUpperCase() === '#FFB000'
                  ? 'border-[var(--pg-accent)] bg-[var(--pg-accent-soft)] text-[var(--pg-accent)]'
                  : 'border-[var(--pg-border)] bg-[var(--pg-well)] text-[var(--pg-muted)] hover:text-[var(--pg-text)]'
              }`}
            >
              Amber CRT
            </button>
            <button
              type="button"
              onClick={() => {
                onChangePhosphorTheme('p4');
                onUpdateSettings({
                  colorMode: 'mono',
                  monoForeground: '#EEF5F0',
                  backgroundColor: '#070A08',
                });
              }}
              className={`min-h-[34px] rounded border px-2 text-xs font-medium cursor-pointer ${
                settings.colorMode === 'mono' &&
                (settings.monoForeground.toUpperCase() === '#EEF5F0' ||
                  settings.monoForeground.toUpperCase() === '#E6EDF3')
                  ? 'border-[var(--pg-accent)] bg-[var(--pg-accent-soft)] text-[var(--pg-accent)]'
                  : 'border-[var(--pg-border)] bg-[var(--pg-well)] text-[var(--pg-muted)] hover:text-[var(--pg-text)]'
              }`}
            >
              B&amp;W Ink
            </button>
            <button
              type="button"
              onClick={() =>
                onUpdateSettings({ colorMode: 'palette', paletteId: 'pico-8' })
              }
              className={`min-h-[34px] rounded border px-2 text-xs font-medium cursor-pointer ${
                settings.colorMode === 'palette'
                  ? 'border-[var(--pg-accent)] bg-[var(--pg-accent-soft)] text-[var(--pg-accent)]'
                  : 'border-[var(--pg-border)] bg-[var(--pg-well)] text-[var(--pg-muted)] hover:text-[var(--pg-text)]'
              }`}
            >
              Retro Palette
            </button>
            <button
              type="button"
              onClick={() => onUpdateSettings({ colorMode: 'grayscale' })}
              className={`min-h-[34px] rounded border px-2 text-xs font-medium cursor-pointer ${
                settings.colorMode === 'grayscale'
                  ? 'border-[var(--pg-accent)] bg-[var(--pg-accent-soft)] text-[var(--pg-accent)]'
                  : 'border-[var(--pg-border)] bg-[var(--pg-well)] text-[var(--pg-muted)] hover:text-[var(--pg-text)]'
              }`}
            >
              Grayscale
            </button>
            <button
              type="button"
              onClick={() => onUpdateSettings({ colorMode: 'truecolor' })}
              className={`min-h-[34px] rounded border px-2 text-xs font-medium cursor-pointer ${
                settings.colorMode === 'truecolor'
                  ? 'border-[var(--pg-accent)] bg-[var(--pg-accent-soft)] text-[var(--pg-accent)]'
                  : 'border-[var(--pg-border)] bg-[var(--pg-well)] text-[var(--pg-muted)] hover:text-[var(--pg-text)]'
              }`}
            >
              Full Color
            </button>
          </div>
        </div>

        <label className="flex items-center justify-between rounded-md border border-[var(--pg-border)] bg-[var(--pg-well)] px-3 py-2 text-xs text-[var(--pg-text)] cursor-pointer select-none">
          <span>Invert light and dark</span>
          <input
            type="checkbox"
            checked={settings.inverse}
            onChange={(e) => onUpdateSettings({ inverse: e.target.checked })}
            className="accent-[var(--pg-accent)] h-4 w-4 rounded"
          />
        </label>

        <button
          type="button"
          onClick={onResetDefaults}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-[var(--pg-border-strong)] bg-[var(--pg-well)] py-2 text-xs font-medium text-[var(--pg-muted)] hover:border-[var(--pg-accent)] hover:text-[var(--pg-text)] transition-colors cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Reset style</span>
        </button>
      </div>
    </div>
  );
};
