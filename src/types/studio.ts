export type RenderMode = 'pixel' | 'ascii' | 'halfblock' | 'braille';

export type DitherAlgorithm =
  | 'none'
  | 'bayer2'
  | 'bayer4'
  | 'bayer8'
  | 'bayer16'
  | 'stochastic'
  | 'floyd-steinberg'
  | 'atkinson'
  | 'stucki';

export type ColorMode = 'mono' | 'grayscale' | 'palette' | 'truecolor';

export type PhosphorTheme = 'p31' | 'p3' | 'p4';

export type WorkspaceSection = 'studio' | 'palettes' | 'characters' | 'presets' | 'batch';

export interface PaletteDefinition {
  id: string;
  name: string;
  isBuiltIn?: boolean;
  colors: string[];
}

export interface CharRampDefinition {
  id: string;
  name: string;
  isBuiltIn?: boolean;
  chars: string;
  description?: string;
}

export interface RenderSettings {
  mode: RenderMode;
  autoFit: boolean;
  nativeOneToOne: boolean;
  columns: number;
  cellAspectRatio: number;
  blurRadius: number;
  posterizeLevels: number; // 0 = off, 2..32
  brightness: number; // -100..100
  contrast: number; // -100..100
  gamma: number; // 0.2..3.0
  edgeBoost: number; // 0..100
  ditherAlgorithm: DitherAlgorithm;
  ditherStrength: number; // 0..100
  serpentine: boolean;
  inverse: boolean;
  colorMode: ColorMode;
  monoForeground: string;
  backgroundColor: string;
  paletteId: string;
  charRampId: string;
  crtOverlay: boolean;
}

export interface StudioPreset {
  id: string;
  name: string;
  isBuiltIn?: boolean;
  createdAt: number;
  settings: RenderSettings;
}

export interface SampleImageItem {
  id: string;
  name: string;
  src: string;
}

export interface SourceImageInfo {
  id: string;
  name: string;
  width: number;
  height: number;
  src: string;
}

export interface RenderResult {
  cols: number;
  rows: number;
  mode: RenderMode;
  codepoints: Uint32Array;
  fgRgba: Uint8ClampedArray;
  bgRgba: Uint8ClampedArray;
  renderTimeMs: number;
}
