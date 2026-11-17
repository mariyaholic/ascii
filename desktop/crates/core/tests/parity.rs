//! Byte-for-byte parity with the browser engine.
//!
//! Each fixture in `tests/golden/` was produced by the studio's TypeScript
//! engine (`src/engine/imageProcessor.ts` + `exporters.ts`) from the same
//! synthetic image and the same settings, and records the cell dimensions plus
//! checksums of the foreground/background color buffers. If the native port
//! drifts in tone, dithering, glyph choice or palette mapping, these tests fail.

use phosphorgrid_core::{
    render_with_settings, to_plain_text, ColorMode, DitherAlgorithm, RenderMode, RenderSettings,
    Rgb,
};

const WIDTH: u32 = 24;
const HEIGHT: u32 = 16;
const MOD: u64 = 1_000_000_007;

/// Same deterministic test image the fixtures were generated from.
fn synthetic_image() -> Vec<u8> {
    let mut data = Vec::with_capacity((WIDTH * HEIGHT * 4) as usize);
    for y in 0..HEIGHT {
        for x in 0..WIDTH {
            data.push(((x * 7 + y * 3) % 256) as u8);
            data.push(((x * 2 + y * 11) % 256) as u8);
            data.push(((x * 5 + y * 5) % 256) as u8);
            data.push(255);
        }
    }
    data
}

fn hash_cells(cells: &[u8]) -> u64 {
    let mut acc: u64 = 0;
    for (index, byte) in cells.iter().enumerate() {
        acc = (acc * 31 + *byte as u64 + (index % 251) as u64) % MOD;
    }
    acc
}

fn base_settings() -> RenderSettings {
    RenderSettings {
        auto_fit: false,
        native_one_to_one: false,
        columns: 32,
        ..Default::default()
    }
}

struct Fixture {
    name: &'static str,
    golden: &'static str,
    settings: RenderSettings,
}

fn fixtures() -> Vec<Fixture> {
    vec![
        Fixture {
            name: "ascii_default",
            golden: include_str!("golden/ascii_default.txt"),
            settings: base_settings(),
        },
        Fixture {
            name: "pixel_pico8",
            golden: include_str!("golden/pixel_pico8.txt"),
            settings: RenderSettings {
                mode: RenderMode::Pixel,
                cell_aspect_ratio: 1.0,
                color_mode: ColorMode::Palette,
                palette_id: "pico-8".to_string(),
                dither_strength: 80.0,
                ..base_settings()
            },
        },
        Fixture {
            name: "halfblock_photo",
            golden: include_str!("golden/halfblock_photo.txt"),
            settings: RenderSettings {
                mode: RenderMode::HalfBlock,
                cell_aspect_ratio: 0.5,
                color_mode: ColorMode::TrueColor,
                dither_algorithm: DitherAlgorithm::FloydSteinberg,
                posterize_levels: 16,
                ..base_settings()
            },
        },
        Fixture {
            name: "braille_ink",
            golden: include_str!("golden/braille_ink.txt"),
            settings: RenderSettings {
                mode: RenderMode::Braille,
                cell_aspect_ratio: 0.5,
                color_mode: ColorMode::Mono,
                dither_algorithm: DitherAlgorithm::Atkinson,
                dither_strength: 90.0,
                mono_foreground: Rgb::new(0xEE, 0xF5, 0xF0),
                background: Rgb::new(0x07, 0x0A, 0x08),
                contrast: 18.0,
                ..base_settings()
            },
        },
    ]
}

#[test]
fn native_renderer_matches_browser_engine() {
    let image = synthetic_image();

    for fixture in fixtures() {
        let (header, body) = fixture
            .golden
            .split_once('\n')
            .unwrap_or_else(|| panic!("{} fixture is malformed", fixture.name));

        let fields: Vec<&str> = header.split('\t').collect();
        assert_eq!(fields.len(), 4, "{} header: {header}", fixture.name);
        let expected_cols: usize = fields[0].parse().expect("cols");
        let expected_rows: usize = fields[1].parse().expect("rows");
        let expected_fg: u64 = fields[2].parse().expect("fg checksum");
        let expected_bg: u64 = fields[3].parse().expect("bg checksum");

        let result = render_with_settings(&image, WIDTH, HEIGHT, &fixture.settings);

        assert_eq!(result.cols, expected_cols, "{} cols", fixture.name);
        assert_eq!(result.rows, expected_rows, "{} rows", fixture.name);
        assert_eq!(
            hash_cells(&result.fg_rgba),
            expected_fg,
            "{} foreground buffer diverged from the browser engine",
            fixture.name
        );
        assert_eq!(
            hash_cells(&result.bg_rgba),
            expected_bg,
            "{} background buffer diverged from the browser engine",
            fixture.name
        );

        // The fixture body is the exact text export, plus one trailing newline.
        let expected_text = body.strip_suffix('\n').unwrap_or(body);
        assert_eq!(
            to_plain_text(&result),
            expected_text,
            "{} character output diverged from the browser engine",
            fixture.name
        );
    }
}

#[test]
fn settings_round_trip_through_the_same_field_names() {
    // Guards the contract that a studio preset can be mapped 1:1 onto the
    // native settings struct.
    let settings = RenderSettings::default();
    assert_eq!(settings.mode.id(), "ascii");
    assert_eq!(settings.dither_algorithm.id(), "bayer8");
    assert_eq!(settings.color_mode.id(), "mono");
    assert_eq!(settings.palette_id, "p31-phosphor");
    assert_eq!(settings.char_ramp_id, "ascii-standard");
    assert_eq!(settings.columns, 112);
}
