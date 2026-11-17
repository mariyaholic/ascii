/**
 * Regenerates (or, with --check, verifies) the Rust port's parity fixtures in
 * desktop/crates/core/tests/golden/ from the browser engine.
 *
 *   npx tsx scripts/parity-golden.ts          # rewrite fixtures
 *   npx tsx scripts/parity-golden.ts --check  # fail if any fixture drifted
 *
 * The synthetic image, checksum and settings must stay in lockstep with
 * desktop/crates/core/tests/parity.rs.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILT_IN_CHAR_RAMPS, BUILT_IN_PALETTES, DEFAULT_RENDER_SETTINGS } from '../src/data/presets';
import { exportToPlainText } from '../src/engine/exporters';
import { processImageBuffer } from '../src/engine/imageProcessor';
import type { RenderSettings } from '../src/types/studio';

const WIDTH = 24;
const HEIGHT = 16;
const MOD = 1_000_000_007n;

const here = path.dirname(fileURLToPath(import.meta.url));
const goldenDir = path.resolve(here, '../desktop/crates/core/tests/golden');

function syntheticImage(): Uint8ClampedArray {
  const data = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
  let i = 0;
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      data[i++] = (x * 7 + y * 3) % 256;
      data[i++] = (x * 2 + y * 11) % 256;
      data[i++] = (x * 5 + y * 5) % 256;
      data[i++] = 255;
    }
  }
  return data;
}

function hashCells(cells: Uint8ClampedArray): bigint {
  let acc = 0n;
  for (let index = 0; index < cells.length; index++) {
    acc = (acc * 31n + BigInt(cells[index]) + BigInt(index % 251)) % MOD;
  }
  return acc;
}

const base: RenderSettings = {
  ...DEFAULT_RENDER_SETTINGS,
  autoFit: false,
  nativeOneToOne: false,
  columns: 32,
};

const fixtures: Array<{ name: string; settings: RenderSettings }> = [
  { name: 'ascii_default', settings: base },
  {
    name: 'pixel_pico8',
    settings: {
      ...base,
      mode: 'pixel',
      cellAspectRatio: 1.0,
      colorMode: 'palette',
      paletteId: 'pico-8',
      ditherStrength: 80,
    },
  },
  {
    name: 'halfblock_photo',
    settings: {
      ...base,
      mode: 'halfblock',
      cellAspectRatio: 0.5,
      colorMode: 'truecolor',
      ditherAlgorithm: 'floyd-steinberg',
      posterizeLevels: 16,
    },
  },
  {
    name: 'braille_ink',
    settings: {
      ...base,
      mode: 'braille',
      cellAspectRatio: 0.5,
      colorMode: 'mono',
      ditherAlgorithm: 'atkinson',
      ditherStrength: 90,
      monoForeground: '#EEF5F0',
      backgroundColor: '#070A08',
      contrast: 18,
    },
  },
];

const check = process.argv.includes('--check');
const image = syntheticImage();
let drift = 0;

for (const fixture of fixtures) {
  const palette =
    BUILT_IN_PALETTES.find((p) => p.id === fixture.settings.paletteId) ?? BUILT_IN_PALETTES[0];
  const ramp =
    BUILT_IN_CHAR_RAMPS.find((r) => r.id === fixture.settings.charRampId) ?? BUILT_IN_CHAR_RAMPS[0];
  const result = processImageBuffer(image, WIDTH, HEIGHT, fixture.settings, palette, ramp);
  const header = [result.cols, result.rows, hashCells(result.fgRgba), hashCells(result.bgRgba)].join(
    '\t'
  );
  const body = `${header}\n${exportToPlainText(result)}\n`;
  const file = path.join(goldenDir, `${fixture.name}.txt`);

  if (check) {
    const current = readFileSync(file, 'utf8');
    if (current !== body) {
      drift++;
      console.error(`DRIFT ${fixture.name}: browser engine output differs from ${file}`);
    } else {
      console.log(`ok    ${fixture.name}`);
    }
  } else {
    writeFileSync(file, body);
    console.log(`wrote ${fixture.name}`);
  }
}

if (drift > 0) process.exit(1);
