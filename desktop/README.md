# PhosphorGrid Desktop (Rust port)

A native Rust build of the PhosphorGrid render engine, plus a GUI shell and a
command-line renderer. It shares the studio's presets, palettes and glyph ramps
with the PWA, and its output is verified byte-for-byte against the browser
engine by the fixtures in `crates/core/tests/golden/`.

```
desktop/
├── crates/core   # dependency-free engine: tone, dithering, glyphs, exporters, auto-tune
├── crates/cli    # `phosphorgrid` — render an image from the terminal
└── crates/app    # `phosphorgrid-studio` — native egui desktop studio
```

## Build and run

Rust 1.77+ (stable) is required.

```bash
cd desktop

cargo test -p phosphorgrid-core          # engine + parity tests
cargo run -p phosphorgrid --release -- ~/Pictures/portrait.jpg --format svg -o out.svg
cargo run -p phosphorgrid-app --release  # desktop studio
```

The desktop studio accepts an image path as its first argument, a dropped file,
or a path typed into the Source panel.

## Command line

```bash
phosphorgrid photo.jpg --mode ascii --columns 120 --dither atkinson > art.txt
phosphorgrid photo.jpg --mode pixel --color palette --palette pico-8 --format png --scale 4 -o pixel.png
phosphorgrid photo.jpg --goal "game boy" --format svg -o handheld.svg
phosphorgrid --list
```

`--goal` runs the same offline histogram/edge auto-tuner the browser falls back
to, so no network or API key is involved.

## Feature parity

| Capability | Browser studio | Native port |
| --- | --- | --- |
| Modes: pixel, ASCII, half-block, braille | yes | yes |
| Dithering: Bayer 2/4/8/16, stochastic, Floyd–Steinberg, Atkinson, Stucki | yes | yes |
| Tone: brightness, contrast, gamma, posterise, blur, edge boost, inverse | yes | yes |
| Color: mono, grayscale, palette (8 built-ins), truecolor | yes | yes |
| Palettes: custom editor + JSON import | yes | built-in palettes only |
| Character ramps: custom editor | yes | built-in ramps only |
| Auto-tune | hosted model + offline fallback | offline analysis only |
| Export TXT / ANSI (16, 256, truecolor) / SVG | yes | yes |
| Export PNG | yes (canvas) | block modes only — no bitmap glyph font in the native engine |
| Batch ZIP export | yes | not yet |

Character art should be exported as SVG or ANSI from the native build; PNG
rasterization of glyphs needs a bundled monospace font, which is tracked as
future work rather than faked with approximations.

## Verified here

`cargo test -p phosphorgrid-core` runs 24 unit tests plus the four cross-engine
parity fixtures. The GUI crate compiles against `eframe`/`egui`; a headless
container has no display server, so the window itself was not exercised in this
environment.
