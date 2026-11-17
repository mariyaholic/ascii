//! Offline style auto-tuner, ported from `src/engine/localAutoTuner.ts`.
//! The browser build can call a hosted model; the native build always uses this
//! deterministic histogram/edge analysis, so tuning works with no network.

use crate::settings::{ColorMode, DitherAlgorithm, RenderMode, RenderSettings};

#[derive(Clone, Debug, PartialEq)]
pub struct StyleRecommendation {
    pub summary: String,
    pub settings: RenderSettings,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ImageStats {
    pub mean_lum: f64,
    pub p5: f64,
    pub p95: f64,
    pub dynamic_range: f64,
    pub mean_saturation: f64,
    pub edge_density: f64,
}

/// Sample the image on a coarse grid and summarise its tonal character.
pub fn analyze_image(rgba: &[u8], width: u32, height: u32) -> ImageStats {
    let width = width.max(1) as usize;
    let height = height.max(1) as usize;
    let mut hist = [0u32; 256];
    let step = ((width * height) / 12_000).max(1);
    let stride = (step as f64).sqrt().round().max(1.0) as usize;

    let mut count = 0u32;
    let mut lum_sum = 0.0f64;
    let mut saturation_sum = 0.0f64;
    let mut edge_sum = 0.0f64;

    let mut y = 0usize;
    while y < height {
        let mut x = 0usize;
        while x < width {
            let index = (y * width + x) * 4;
            let r = rgba[index] as f64;
            let g = rgba[index + 1] as f64;
            let b = rgba[index + 2] as f64;
            let lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            hist[lum.round().clamp(0.0, 255.0) as usize] += 1;
            lum_sum += lum;

            let max_c = r.max(g).max(b);
            let min_c = r.min(g).min(b);
            saturation_sum += if max_c > 0.0 {
                (max_c - min_c) / max_c
            } else {
                0.0
            };

            if x + 1 < width && y + 1 < height {
                let right = (y * width + (x + 1)) * 4;
                let down = ((y + 1) * width + x) * 4;
                let lum_right = 0.2126 * rgba[right] as f64
                    + 0.7152 * rgba[right + 1] as f64
                    + 0.0722 * rgba[right + 2] as f64;
                let lum_down = 0.2126 * rgba[down] as f64
                    + 0.7152 * rgba[down + 1] as f64
                    + 0.0722 * rgba[down + 2] as f64;
                edge_sum += (lum - lum_right).abs() + (lum - lum_down).abs();
            }

            count += 1;
            x += stride;
        }
        y += stride;
    }

    let safe_count = count.max(1) as f64;
    let target_5 = safe_count * 0.05;
    let target_95 = safe_count * 0.95;
    let mut acc = 0.0f64;
    let mut p5 = 0.0f64;
    let mut p95 = 255.0f64;
    for (level, bin) in hist.iter().enumerate() {
        acc += *bin as f64;
        if acc >= target_5 && p5 == 0.0 {
            p5 = level as f64;
        }
        if acc >= target_95 {
            p95 = level as f64;
            break;
        }
    }

    ImageStats {
        mean_lum: lum_sum / safe_count,
        p5,
        p95,
        dynamic_range: (p95 - p5).max(1.0),
        mean_saturation: saturation_sum / safe_count,
        edge_density: edge_sum / (safe_count * 2.0),
    }
}

/// Recommend render settings for an image and an optional plain-English goal.
pub fn compute_local_auto_tune(
    rgba: &[u8],
    width: u32,
    height: u32,
    base: &RenderSettings,
    goal_prompt: Option<&str>,
) -> StyleRecommendation {
    let stats = analyze_image(rgba, width, height);
    let goal = goal_prompt.unwrap_or("").to_lowercase();

    let flat_contrast_boost = if stats.dynamic_range < 140.0 {
        ((160.0 - stats.dynamic_range) * 0.35).min(36.0).round() as f32
    } else {
        8.0
    };
    let brightness_offset: f32 = if stats.mean_lum < 75.0 {
        12.0
    } else if stats.mean_lum > 190.0 {
        -12.0
    } else {
        0.0
    };
    let gamma_lift: f32 = if stats.mean_lum < 85.0 {
        1.18
    } else if stats.mean_lum > 180.0 {
        0.88
    } else {
        1.0
    };

    let with_tone = |settings: RenderSettings, contrast_floor: f32| {
        let mut next = settings;
        next.contrast = contrast_floor.max(flat_contrast_boost);
        next.brightness = brightness_offset;
        next.gamma = gamma_lift;
        next.auto_fit = false;
        next.native_one_to_one = false;
        next
    };

    let contains_any = |needles: &[&str]| needles.iter().any(|needle| goal.contains(needle));

    if contains_any(&["newspaper", "ink", "sketch", "print"]) {
        let settings = with_tone(
            RenderSettings {
                mode: RenderMode::Braille,
                dither_algorithm: DitherAlgorithm::Atkinson,
                dither_strength: 90.0,
                color_mode: ColorMode::Mono,
                mono_foreground: crate::settings::Rgb::new(0xEE, 0xF5, 0xF0),
                background: crate::settings::Rgb::new(0x07, 0x0A, 0x08),
                edge_boost: 25.0,
                blur_radius: 0,
                posterize_levels: 0,
                inverse: false,
                crt_overlay: false,
                ..base.clone()
            },
            18.0,
        );
        return StyleRecommendation {
            summary:
                "Applied crisp Atkinson ink dithering with lifted midtones for a clean print feel."
                    .to_string(),
            settings,
        };
    }

    if contains_any(&["game boy", "gameboy", "handheld"]) {
        let settings = with_tone(
            RenderSettings {
                mode: RenderMode::Pixel,
                dither_algorithm: DitherAlgorithm::Bayer8,
                dither_strength: 75.0,
                color_mode: ColorMode::Palette,
                palette_id: "dmg-gameboy".to_string(),
                edge_boost: 10.0,
                blur_radius: 0,
                posterize_levels: 0,
                columns: 88,
                crt_overlay: false,
                ..base.clone()
            },
            14.0,
        );
        return StyleRecommendation {
            summary:
                "Matched the classic 4-shade Game Boy palette with structured Bayer 8x8 dithering."
                    .to_string(),
            settings,
        };
    }

    if goal.contains("amber") {
        let settings = with_tone(
            RenderSettings {
                mode: RenderMode::Ascii,
                char_ramp_id: "unicode-blocks".to_string(),
                dither_algorithm: DitherAlgorithm::FloydSteinberg,
                dither_strength: 75.0,
                color_mode: ColorMode::Palette,
                palette_id: "p3-amber".to_string(),
                mono_foreground: crate::settings::Rgb::new(0xFF, 0xB0, 0x00),
                background: crate::settings::Rgb::new(0x08, 0x06, 0x02),
                edge_boost: 15.0,
                crt_overlay: true,
                ..base.clone()
            },
            0.0,
        );
        return StyleRecommendation {
            summary:
                "Configured warm P3 Amber phosphor blocks with smooth error-diffusion shading."
                    .to_string(),
            settings,
        };
    }

    if contains_any(&["pixel", "retro", "arcade", "8-bit"]) {
        let settings = with_tone(
            RenderSettings {
                mode: RenderMode::Pixel,
                dither_algorithm: DitherAlgorithm::Bayer4,
                dither_strength: 65.0,
                color_mode: ColorMode::Palette,
                palette_id: "pico-8".to_string(),
                edge_boost: 5.0,
                blur_radius: 0,
                columns: 84,
                crt_overlay: false,
                ..base.clone()
            },
            10.0,
        );
        return StyleRecommendation {
            summary: "Set up vibrant 16-color PICO-8 pixel art with clean Bayer 4x4 shading."
                .to_string(),
            settings,
        };
    }

    if contains_any(&["stencil", "simple", "poster", "clean"]) {
        let settings = with_tone(
            RenderSettings {
                mode: RenderMode::Pixel,
                dither_algorithm: DitherAlgorithm::None,
                dither_strength: 0.0,
                color_mode: if stats.mean_saturation > 0.25 {
                    ColorMode::Palette
                } else {
                    ColorMode::Grayscale
                },
                palette_id: "pico-8".to_string(),
                blur_radius: 1,
                posterize_levels: 5,
                edge_boost: 20.0,
                crt_overlay: false,
                ..base.clone()
            },
            20.0,
        );
        return StyleRecommendation {
            summary:
                "Simplified tones with gentle smoothing and 5-level posterization for bold shapes."
                    .to_string(),
            settings,
        };
    }

    let is_colorful = stats.mean_saturation > 0.24;
    let is_detailed_photo = stats.edge_density < 22.0;

    if is_colorful && is_detailed_photo {
        let settings = with_tone(
            RenderSettings {
                mode: RenderMode::HalfBlock,
                cell_aspect_ratio: 0.5,
                dither_algorithm: DitherAlgorithm::Bayer4,
                dither_strength: 45.0,
                color_mode: ColorMode::TrueColor,
                edge_boost: 10.0,
                blur_radius: 0,
                posterize_levels: 16,
                crt_overlay: false,
                ..base.clone()
            },
            0.0,
        );
        return StyleRecommendation {
            summary:
                "Rich colors detected — tuned double-height half-blocks with smooth Bayer 4x4 shading."
                    .to_string(),
            settings,
        };
    }

    if is_colorful {
        let settings = with_tone(
            RenderSettings {
                mode: RenderMode::Pixel,
                cell_aspect_ratio: 1.0,
                dither_algorithm: DitherAlgorithm::Bayer8,
                dither_strength: 70.0,
                color_mode: ColorMode::Palette,
                palette_id: "pico-8".to_string(),
                edge_boost: 10.0,
                blur_radius: 0,
                posterize_levels: 0,
                crt_overlay: false,
                ..base.clone()
            },
            0.0,
        );
        return StyleRecommendation {
            summary:
                "High-contrast color subject — applied the PICO-8 palette with Bayer 8x8 dither."
                    .to_string(),
            settings,
        };
    }

    let settings = with_tone(
        RenderSettings {
            mode: RenderMode::Ascii,
            cell_aspect_ratio: 0.52,
            char_ramp_id: "ascii-standard".to_string(),
            dither_algorithm: DitherAlgorithm::Atkinson,
            dither_strength: 80.0,
            color_mode: ColorMode::Mono,
            mono_foreground: crate::settings::Rgb::new(0x33, 0xFF, 0x66),
            background: crate::settings::Rgb::new(0x05, 0x08, 0x06),
            edge_boost: 20.0,
            blur_radius: 0,
            posterize_levels: 0,
            crt_overlay: true,
            ..base.clone()
        },
        12.0,
    );
    StyleRecommendation {
        summary:
            "Balanced shadows and midtones with Atkinson dithering for crisp monochrome detail."
                .to_string(),
        settings,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn image(width: u32, height: u32, dark: bool) -> Vec<u8> {
        let mut data = Vec::new();
        for y in 0..height {
            for x in 0..width {
                let base = ((x * 3 + y * 2) % 90) as u8;
                let value = if dark { base / 3 } else { 150 + base };
                data.extend_from_slice(&[value, value / 2, 255 - value, 255]);
            }
        }
        data
    }

    #[test]
    fn stats_detect_dark_and_bright_images() {
        let dark = analyze_image(&image(64, 64, true), 64, 64);
        let bright = analyze_image(&image(64, 64, false), 64, 64);
        assert!(dark.mean_lum < bright.mean_lum);
        assert!(dark.p95 >= dark.p5);
    }

    #[test]
    fn goals_route_to_expected_modes() {
        let base = RenderSettings::default();
        let pixels = image(64, 64, false);

        let ink = compute_local_auto_tune(&pixels, 64, 64, &base, Some("newspaper print"));
        assert_eq!(ink.settings.mode, RenderMode::Braille);
        assert_eq!(ink.settings.dither_algorithm, DitherAlgorithm::Atkinson);

        let gameboy = compute_local_auto_tune(&pixels, 64, 64, &base, Some("game boy"));
        assert_eq!(gameboy.settings.palette_id, "dmg-gameboy");

        let retro = compute_local_auto_tune(&pixels, 64, 64, &base, Some("retro arcade"));
        assert_eq!(retro.settings.palette_id, "pico-8");

        let fallback = compute_local_auto_tune(&pixels, 64, 64, &base, None);
        assert!(!fallback.summary.is_empty());
    }

    #[test]
    fn tuning_keeps_columns_untouched_unless_specified() {
        let base = RenderSettings::default().with_columns(96);
        let tuned = compute_local_auto_tune(&image(48, 48, false), 48, 48, &base, None);
        assert_eq!(tuned.settings.columns, 96);
        assert!(!tuned.settings.auto_fit);
    }
}
