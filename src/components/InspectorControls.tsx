import React from 'react';
import { Pencil, RotateCcw } from 'lucide-react';
import type {
  CharRampDefinition,
  ColorMode,
  DitherAlgorithm,
  PaletteDefinition,
  PhosphorTheme,
  RenderMode,
  RenderResult,
  RenderSettings,
  SourceImageInfo,
} from '../types/studio';

export type InspectorTab = 'all' | 'mode' | 'dither' | 'color';

interface InspectorControlsProps {
  settings: RenderSettings;
  phosphorTheme: PhosphorTheme;
  palettes: PaletteDefinition[];
  charRamps: CharRampDefinition[];
  sourceImage: SourceImageInfo | null;
  renderResult: RenderResult | null;
  sectionFilter?: InspectorTab;
  onUpdateSettings: (patch: Partial<RenderSettings>) => void;
  onChangePhosphorTheme: (theme: PhosphorTheme) => void;
  onResetDefaults: () => void;
  onOpenPaletteEditor: () => void;
  onOpenCharEditor: () => void;
  onAutoFitNow: () => void;
}

const RENDER_MODES: ReadonlyArray<{ id: RenderMode; label: string }> = [
  { id: 'pixel', label: 'Pixel' },
  { id: 'ascii', label: 'ASCII' },
  { id: 'halfblock', label: 'Half-Block' },
  { id: 'braille', label: 'Braille' },
];

const DITHER_OPTIONS: ReadonlyArray<{ id: DitherAlgorithm; label: string; group: string }> = [
  { id: 'none', label: 'None (Direct Quantize)', group: 'Off' },
  { id: 'bayer2', label: 'Bayer 2×2 (Ordered)', group: 'Ordered' },
  { id: 'bayer4', label: 'Bayer 4×4 (Ordered)', group: 'Ordered' },
  { id: 'bayer8', label: 'Bayer 8×8 (Ordered)', group: 'Ordered' },
  { id: 'bayer16', label: 'Bayer 16×16 (Fine)', group: 'Ordered' },
  { id: 'stochastic', label: 'Stochastic (Blue-Noise Hash)', group: 'Ordered' },
  { id: 'floyd-steinberg', label: 'Floyd-Steinberg', group: 'Error Diffusion' },
  { id: 'atkinson', label: 'Atkinson (Classic Mac)', group: 'Error Diffusion' },
  { id: 'stucki', label: 'Stucki (Smooth)', group: 'Error Diffusion' },
];

const COLOR_MODES: ReadonlyArray<{ id: ColorMode; label: string }> = [
  { id: 'mono', label: 'Mono' },
  { id: 'grayscale', label: 'Gray' },
  { id: 'palette', label: 'Palette' },
  { id: 'truecolor', label: 'TrueColor' },
];

const PHOSPHOR_THEMES: ReadonlyArray<{ id: PhosphorTheme; label: string; fg: string; bg: string }> = [
  { id: 'p31', label: 'P31 Green', fg: '#33FF66', bg: '#050806' },
  { id: 'p3', label: 'P3 Amber', fg: '#FFB000', bg: '#080602' },
  { id: 'p4', label: 'P4 Paper', fg: '#E6EDF3', bg: '#07090B' },
];

interface SliderRowProps {
  label: string;
  valueDisplay: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  onChange: (v: number) => void;
}

const SliderRow: React.FC<SliderRowProps> = ({
  label,
  valueDisplay,
  value,
  min,
  max,
  step = 1,
  disabled = false,
  onChange,
}) => (
  <div className={`space-y-1.5 ${disabled ? 'opacity-45 pointer-events-none' : ''}`}>
    <div className="flex items-center justify-between text-xs">
      <label className="text-[var(--pg-muted)] font-medium">{label}</label>
      <span className="font-mono-grid text-[var(--pg-text)]">{valueDisplay}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="pg-slider"
    />
  </div>
);

export const InspectorControls: React.FC<InspectorControlsProps> = ({
  settings,
  phosphorTheme,
  palettes,
  charRamps,
  sourceImage,
  renderResult,
  sectionFilter = 'all',
  onUpdateSettings,
  onChangePhosphorTheme,
  onResetDefaults,
  onOpenPaletteEditor,
  onOpenCharEditor,
  onAutoFitNow,
}) => {
  const showMode = sectionFilter === 'all' || sectionFilter === 'mode';
  const showDither = sectionFilter === 'all' || sectionFilter === 'dither';
  const showColor = sectionFilter === 'all' || sectionFilter === 'color';

  const isErrorDiffusion =
    settings.ditherAlgorithm === 'floyd-steinberg' ||
    settings.ditherAlgorithm === 'atkinson' ||
    settings.ditherAlgorithm === 'stucki';

  return (
    <div className="divide-y divide-[var(--pg-border)] text-sm">
      {/* Group 1: Output Mode & Resolution Sizing */}
      {showMode && (
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xs font-semibold uppercase tracking-wider text-[var(--pg-text)]">
              Render Mode &amp; Grid
            </h2>
            {renderResult && (
              <span className="font-mono-grid text-xs text-[var(--pg-muted)]">
                {renderResult.cols}×{renderResult.rows}
              </span>
            )}
          </div>

          <div className="grid grid-cols-4 gap-1 rounded-md bg-[var(--pg-well)] p-1 border border-[var(--pg-border)]">
            {RENDER_MODES.map((m) => {
              const active = settings.mode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    const aspect =
                      m.id === 'pixel'
                        ? 1.0
                        : m.id === 'halfblock' || m.id === 'braille'
                        ? 0.5
                        : 0.52;
                    onUpdateSettings({ mode: m.id, cellAspectRatio: aspect });
                  }}
                  className={`min-h-[34px] rounded px-1.5 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    active
                      ? 'bg-[var(--pg-accent)] text-[var(--pg-accent-ink)] font-semibold'
                      : 'text-[var(--pg-muted)] hover:text-[var(--pg-text)]'
                  }`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-xs text-[var(--pg-text)] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={settings.autoFit}
                onChange={(e) => {
                  onUpdateSettings({
                    autoFit: e.target.checked,
                    nativeOneToOne: e.target.checked ? false : settings.nativeOneToOne,
                  });
                  if (e.target.checked) onAutoFitNow();
                }}
                className="accent-[var(--pg-accent)] h-4 w-4 rounded"
              />
              <span>Auto-Fit Resolution</span>
            </label>

            <label className="flex items-center gap-2 text-xs text-[var(--pg-text)] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={settings.nativeOneToOne}
                onChange={(e) =>
                  onUpdateSettings({
                    nativeOneToOne: e.target.checked,
                    autoFit: e.target.checked ? false : settings.autoFit,
                  })
                }
                className="accent-[var(--pg-accent)] h-4 w-4 rounded"
              />
              <span>1:1 Native</span>
            </label>
          </div>

          <SliderRow
            label="Grid Columns"
            valueDisplay={`${settings.nativeOneToOne && sourceImage ? Math.min(sourceImage.width, 320) : settings.columns} cols`}
            value={settings.columns}
            min={16}
            max={320}
            step={2}
            disabled={settings.nativeOneToOne}
            onChange={(v) => onUpdateSettings({ columns: v, autoFit: false })}
          />

          {settings.mode !== 'pixel' && (
            <SliderRow
              label="Cell Aspect Compensation"
              valueDisplay={settings.cellAspectRatio.toFixed(2)}
              value={settings.cellAspectRatio}
              min={0.35}
              max={1.0}
              step={0.01}
              onChange={(v) => onUpdateSettings({ cellAspectRatio: v })}
            />
          )}
        </div>
      )}

      {/* Group 2: Simplification & Tone */}
      {showMode && (
        <div className="p-4 space-y-4">
          <h2 className="font-display text-xs font-semibold uppercase tracking-wider text-[var(--pg-text)]">
            Simplification &amp; Tone
          </h2>

          <SliderRow
            label="Spatial Smoothing"
            valueDisplay={settings.blurRadius === 0 ? 'Off' : `${settings.blurRadius} px`}
            value={settings.blurRadius}
            min={0}
            max={6}
            step={1}
            onChange={(v) => onUpdateSettings({ blurRadius: v })}
          />

          <SliderRow
            label="Posterize Levels"
            valueDisplay={settings.posterizeLevels < 2 ? 'Off' : `${settings.posterizeLevels} levels`}
            value={settings.posterizeLevels}
            min={0}
            max={32}
            step={1}
            onChange={(v) => onUpdateSettings({ posterizeLevels: v === 1 ? 2 : v })}
          />

          <SliderRow
            label="Edge Boost"
            valueDisplay={`${settings.edgeBoost}%`}
            value={settings.edgeBoost}
            min={0}
            max={100}
            step={5}
            onChange={(v) => onUpdateSettings({ edgeBoost: v })}
          />

          <SliderRow
            label="Contrast"
            valueDisplay={settings.contrast > 0 ? `+${settings.contrast}` : `${settings.contrast}`}
            value={settings.contrast}
            min={-80}
            max={80}
            step={2}
            onChange={(v) => onUpdateSettings({ contrast: v })}
          />

          <SliderRow
            label="Brightness"
            valueDisplay={
              settings.brightness > 0 ? `+${settings.brightness}` : `${settings.brightness}`
            }
            value={settings.brightness}
            min={-80}
            max={80}
            step={2}
            onChange={(v) => onUpdateSettings({ brightness: v })}
          />

          <SliderRow
            label="Gamma"
            valueDisplay={settings.gamma.toFixed(2)}
            value={settings.gamma}
            min={0.3}
            max={2.6}
            step={0.05}
            onChange={(v) => onUpdateSettings({ gamma: v })}
          />
        </div>
      )}

      {/* Group 3: Dithering (Bayer & Error Diffusion) */}
      {showDither && (
        <div className="p-4 space-y-4">
          <h2 className="font-display text-xs font-semibold uppercase tracking-wider text-[var(--pg-text)]">
            Dithering Engine
          </h2>

          <div className="space-y-1.5">
            <label
              htmlFor="dither-algo-select"
              className="block text-xs font-medium text-[var(--pg-muted)]"
            >
              Algorithm
            </label>
            <select
              id="dither-algo-select"
              value={settings.ditherAlgorithm}
              onChange={(e) =>
                onUpdateSettings({ ditherAlgorithm: e.target.value as DitherAlgorithm })
              }
              className="w-full rounded-md border border-[var(--pg-border-strong)] bg-[var(--pg-well)] px-3 py-2 text-xs text-[var(--pg-text)] focus:border-[var(--pg-accent)] focus:outline-none"
            >
              {DITHER_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <SliderRow
            label="Dither Strength"
            valueDisplay={`${settings.ditherStrength}%`}
            value={settings.ditherStrength}
            min={0}
            max={100}
            step={5}
            disabled={settings.ditherAlgorithm === 'none'}
            onChange={(v) => onUpdateSettings({ ditherStrength: v })}
          />

          {isErrorDiffusion && (
            <label className="flex items-center justify-between text-xs text-[var(--pg-text)] cursor-pointer select-none">
              <span>Serpentine Scan (Alternating Rows)</span>
              <input
                type="checkbox"
                checked={settings.serpentine}
                onChange={(e) => onUpdateSettings({ serpentine: e.target.checked })}
                className="accent-[var(--pg-accent)] h-4 w-4 rounded"
              />
            </label>
          )}
        </div>
      )}

      {/* Group 4: Polarity, Color Modes, Palettes & Character Ramps */}
      {showColor && (
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xs font-semibold uppercase tracking-wider text-[var(--pg-text)]">
              Color, Polarity &amp; Glyphs
            </h2>
            <label className="flex items-center gap-2 text-xs font-medium text-[var(--pg-text)] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={settings.inverse}
                onChange={(e) => onUpdateSettings({ inverse: e.target.checked })}
                className="accent-[var(--pg-accent)] h-4 w-4 rounded"
              />
              <span>Inverse</span>
            </label>
          </div>

          <div className="grid grid-cols-4 gap-1 rounded-md bg-[var(--pg-well)] p-1 border border-[var(--pg-border)]">
            {COLOR_MODES.map((cm) => {
              const active = settings.colorMode === cm.id;
              return (
                <button
                  key={cm.id}
                  type="button"
                  onClick={() => onUpdateSettings({ colorMode: cm.id })}
                  className={`min-h-[34px] rounded px-1.5 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    active
                      ? 'bg-[var(--pg-accent)] text-[var(--pg-accent-ink)] font-semibold'
                      : 'text-[var(--pg-muted)] hover:text-[var(--pg-text)]'
                  }`}
                >
                  {cm.label}
                </button>
              );
            })}
          </div>

          {settings.colorMode === 'mono' && (
            <div className="grid grid-cols-2 gap-3">
              <label className="flex items-center justify-between rounded-md border border-[var(--pg-border)] bg-[var(--pg-well)] px-2.5 py-1.5 text-xs">
                <span className="text-[var(--pg-muted)]">Foreground</span>
                <input
                  type="color"
                  value={settings.monoForeground}
                  onChange={(e) => onUpdateSettings({ monoForeground: e.target.value })}
                  className="h-5 w-7 cursor-pointer bg-transparent border-0"
                />
              </label>
              <label className="flex items-center justify-between rounded-md border border-[var(--pg-border)] bg-[var(--pg-well)] px-2.5 py-1.5 text-xs">
                <span className="text-[var(--pg-muted)]">Background</span>
                <input
                  type="color"
                  value={settings.backgroundColor}
                  onChange={(e) => onUpdateSettings({ backgroundColor: e.target.value })}
                  className="h-5 w-7 cursor-pointer bg-transparent border-0"
                />
              </label>
            </div>
          )}

          {settings.colorMode === 'palette' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="palette-select"
                  className="text-xs font-medium text-[var(--pg-muted)]"
                >
                  Active Palette
                </label>
                <button
                  type="button"
                  onClick={onOpenPaletteEditor}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[var(--pg-accent)] hover:underline cursor-pointer"
                >
                  <Pencil className="w-3 h-3" aria-hidden="true" />
                  <span>Edit Palettes</span>
                </button>
              </div>
              <select
                id="palette-select"
                value={settings.paletteId}
                onChange={(e) => onUpdateSettings({ paletteId: e.target.value })}
                className="w-full rounded-md border border-[var(--pg-border-strong)] bg-[var(--pg-well)] px-3 py-2 text-xs text-[var(--pg-text)] focus:border-[var(--pg-accent)] focus:outline-none"
              >
                {palettes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.colors.length} colors)
                  </option>
                ))}
              </select>
              {/* Color swatch strip */}
              <div className="flex h-3 w-full overflow-hidden rounded border border-[var(--pg-border)]">
                {(palettes.find((p) => p.id === settings.paletteId)?.colors ?? []).map((hex, i) => (
                  <div key={`${hex}-${i}`} className="flex-1" style={{ backgroundColor: hex }} />
                ))}
              </div>
            </div>
          )}

          {settings.mode === 'ascii' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="ramp-select"
                  className="text-xs font-medium text-[var(--pg-muted)]"
                >
                  Unicode Character Ramp
                </label>
                <button
                  type="button"
                  onClick={onOpenCharEditor}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[var(--pg-accent)] hover:underline cursor-pointer"
                >
                  <Pencil className="w-3 h-3" aria-hidden="true" />
                  <span>Edit Ramp</span>
                </button>
              </div>
              <select
                id="ramp-select"
                value={settings.charRampId}
                onChange={(e) => onUpdateSettings({ charRampId: e.target.value })}
                className="w-full rounded-md border border-[var(--pg-border-strong)] bg-[var(--pg-well)] px-3 py-2 text-xs text-[var(--pg-text)] focus:border-[var(--pg-accent)] focus:outline-none"
              >
                {charRamps.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <div className="truncate rounded border border-[var(--pg-border)] bg-[var(--pg-well)] px-2.5 py-1.5 font-mono-grid text-xs text-[var(--pg-muted)]">
                {charRamps.find((r) => r.id === settings.charRampId)?.chars}
              </div>
            </div>
          )}

          {/* Phosphor CRT UI Accent Switcher */}
          <div className="space-y-1.5 pt-1">
            <span className="block text-xs font-medium text-[var(--pg-muted)]">
              Studio Phosphor Tube
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              {PHOSPHOR_THEMES.map((pt) => {
                const active = phosphorTheme === pt.id;
                return (
                  <button
                    key={pt.id}
                    type="button"
                    onClick={() => {
                      onChangePhosphorTheme(pt.id);
                      if (settings.colorMode === 'mono') {
                        onUpdateSettings({ monoForeground: pt.fg, backgroundColor: pt.bg });
                      }
                    }}
                    className={`min-h-[34px] rounded border px-2 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                      active
                        ? 'border-[var(--pg-accent)] bg-[var(--pg-accent-soft)] text-[var(--pg-accent)]'
                        : 'border-[var(--pg-border)] bg-[var(--pg-well)] text-[var(--pg-muted)] hover:text-[var(--pg-text)]'
                    }`}
                  >
                    {pt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={onResetDefaults}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-[var(--pg-border-strong)] bg-[var(--pg-well)] py-2 text-xs font-medium text-[var(--pg-muted)] hover:border-[var(--pg-accent)] hover:text-[var(--pg-text)] transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Reset Parameters</span>
          </button>
        </div>
      )}
    </div>
  );
};
