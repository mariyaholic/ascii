//! Text, ANSI, SVG and raster exporters — the native equivalents of
//! `src/engine/exporters.ts`.

use crate::render::RenderResult;
use crate::settings::{RenderMode, Rgb};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AnsiColorDepth {
    Ansi16,
    Ansi256,
    TrueColor,
}

impl AnsiColorDepth {
    pub fn id(self) -> &'static str {
        match self {
            AnsiColorDepth::Ansi16 => "16",
            AnsiColorDepth::Ansi256 => "256",
            AnsiColorDepth::TrueColor => "truecolor",
        }
    }

    pub fn from_id(id: &str) -> Option<Self> {
        match id {
            "16" => Some(AnsiColorDepth::Ansi16),
            "256" => Some(AnsiColorDepth::Ansi256),
            "truecolor" => Some(AnsiColorDepth::TrueColor),
            _ => None,
        }
    }
}

fn glyph_for(codepoint: u32) -> char {
    char::from_u32(codepoint).unwrap_or(' ')
}

/// UTF-8 art with no escapes: one glyph per cell, one line per row.
pub fn to_plain_text(result: &RenderResult) -> String {
    let mut out = String::with_capacity(result.cell_count() + result.rows);
    for y in 0..result.rows {
        if y > 0 {
            out.push('\n');
        }
        for x in 0..result.cols {
            out.push(glyph_for(result.codepoints[y * result.cols + x]));
        }
    }
    out
}

const ANSI_16_RGB: [[u8; 3]; 16] = [
    [0, 0, 0],
    [128, 0, 0],
    [0, 128, 0],
    [128, 128, 0],
    [0, 0, 128],
    [128, 0, 128],
    [0, 128, 128],
    [192, 192, 192],
    [128, 128, 128],
    [255, 0, 0],
    [0, 255, 0],
    [255, 255, 0],
    [0, 0, 255],
    [255, 0, 255],
    [0, 255, 255],
    [255, 255, 255],
];

fn nearest_ansi16(r: u8, g: u8, b: u8) -> usize {
    let mut best = 0usize;
    let mut best_distance = i32::MAX;
    for (index, color) in ANSI_16_RGB.iter().enumerate() {
        let dr = r as i32 - color[0] as i32;
        let dg = g as i32 - color[1] as i32;
        let db = b as i32 - color[2] as i32;
        let distance = dr * dr + dg * dg + db * db;
        if distance < best_distance {
            best_distance = distance;
            best = index;
        }
    }
    best
}

fn rgb_to_ansi256(r: u8, g: u8, b: u8) -> u32 {
    if r == g && g == b {
        if r < 8 {
            return 16;
        }
        if r > 248 {
            return 231;
        }
        return (((r as f64 - 8.0) / 247.0) * 24.0).round() as u32 + 232;
    }
    let ri = ((r as f64 / 255.0) * 5.0).round() as u32;
    let gi = ((g as f64 / 255.0) * 5.0).round() as u32;
    let bi = ((b as f64 / 255.0) * 5.0).round() as u32;
    16 + 36 * ri + 6 * gi + bi
}

/// ANSI art with SGR escapes. Backgrounds are emitted only for the modes that
/// actually use them (pixel blocks and half blocks).
pub fn to_ansi(result: &RenderResult, depth: AnsiColorDepth) -> String {
    let include_bg = matches!(result.mode, RenderMode::HalfBlock | RenderMode::Pixel);
    let mut out = String::new();

    for y in 0..result.rows {
        if y > 0 {
            out.push('\n');
        }
        let mut previous_key = String::new();
        for x in 0..result.cols {
            let fg = result.fg(x, y);
            let bg = result.bg(x, y);
            let glyph = if result.mode == RenderMode::Pixel {
                ' '
            } else {
                glyph_for(result.codepoints[y * result.cols + x])
            };

            let key = match depth {
                AnsiColorDepth::TrueColor => {
                    if include_bg {
                        format!(
                            "38;2;{};{};{};48;2;{};{};{}",
                            fg[0], fg[1], fg[2], bg[0], bg[1], bg[2]
                        )
                    } else {
                        format!("38;2;{};{};{}", fg[0], fg[1], fg[2])
                    }
                }
                AnsiColorDepth::Ansi256 => {
                    let fg_index = rgb_to_ansi256(fg[0], fg[1], fg[2]);
                    if include_bg {
                        let bg_index = rgb_to_ansi256(bg[0], bg[1], bg[2]);
                        format!("38;5;{fg_index};48;5;{bg_index}")
                    } else {
                        format!("38;5;{fg_index}")
                    }
                }
                AnsiColorDepth::Ansi16 => {
                    let fg_index = nearest_ansi16(fg[0], fg[1], fg[2]);
                    let fg_code = if fg_index < 8 {
                        30 + fg_index
                    } else {
                        90 + (fg_index - 8)
                    };
                    if include_bg {
                        let bg_index = nearest_ansi16(bg[0], bg[1], bg[2]);
                        let bg_code = if bg_index < 8 {
                            40 + bg_index
                        } else {
                            100 + (bg_index - 8)
                        };
                        format!("{fg_code};{bg_code}")
                    } else {
                        format!("{fg_code}")
                    }
                }
            };

            if key != previous_key {
                out.push_str("\x1b[");
                out.push_str(&key);
                out.push('m');
                previous_key = key;
            }
            out.push(glyph);
        }
        out.push_str("\x1b[0m");
    }

    out
}

fn escape_xml(input: char) -> &'static str {
    match input {
        '&' => "&amp;",
        '<' => "&lt;",
        '>' => "&gt;",
        '"' => "&quot;",
        '\'' => "&apos;",
        _ => "",
    }
}

/// Vector export. Pixel and half-block modes become rectangles; character
/// modes emit one `<text>` element per non-empty cell.
pub fn to_svg(result: &RenderResult, cell_aspect_ratio: f32) -> String {
    let cell_w: usize = 10;
    let cell_h: usize = if result.mode == RenderMode::Pixel {
        10
    } else {
        10.max((cell_w as f64 / (cell_aspect_ratio as f64).max(0.25)).round() as usize)
    };
    let width = result.cols * cell_w;
    let height = result.rows * cell_h;

    let mut parts: Vec<String> = Vec::new();
    parts.push(format!(
        "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 {width} {height}\" width=\"{width}\" height=\"{height}\" shape-rendering=\"crispEdges\">"
    ));

    let bg0 = if result.bg_rgba.len() >= 3 {
        Rgb::new(result.bg_rgba[0], result.bg_rgba[1], result.bg_rgba[2])
    } else {
        Rgb::new(5, 8, 6)
    };
    let bg0_hex = bg0.to_hex();
    parts.push(format!(
        "<rect width=\"{width}\" height=\"{height}\" fill=\"{bg0_hex}\" />"
    ));

    match result.mode {
        RenderMode::Pixel => {
            for y in 0..result.rows {
                for x in 0..result.cols {
                    let fg = result.fg(x, y);
                    let hex = Rgb::new(fg[0], fg[1], fg[2]).to_hex();
                    if hex != bg0_hex {
                        parts.push(format!(
                            "<rect x=\"{}\" y=\"{}\" width=\"{cell_w}\" height=\"{cell_h}\" fill=\"{hex}\" />",
                            x * cell_w,
                            y * cell_h
                        ));
                    }
                }
            }
        }
        RenderMode::HalfBlock => {
            let half_h = cell_h / 2;
            for y in 0..result.rows {
                for x in 0..result.cols {
                    let fg = result.fg(x, y);
                    let bg = result.bg(x, y);
                    let top_hex = Rgb::new(fg[0], fg[1], fg[2]).to_hex();
                    let bottom_hex = Rgb::new(bg[0], bg[1], bg[2]).to_hex();
                    if top_hex != bg0_hex {
                        parts.push(format!(
                            "<rect x=\"{}\" y=\"{}\" width=\"{cell_w}\" height=\"{half_h}\" fill=\"{top_hex}\" />",
                            x * cell_w,
                            y * cell_h
                        ));
                    }
                    if bottom_hex != bg0_hex {
                        parts.push(format!(
                            "<rect x=\"{}\" y=\"{}\" width=\"{cell_w}\" height=\"{half_h}\" fill=\"{bottom_hex}\" />",
                            x * cell_w,
                            y * cell_h + half_h
                        ));
                    }
                }
            }
        }
        _ => {
            let font_size = (cell_h as f64 * 0.86).round() as usize;
            parts.push(format!(
                "<g font-family=\"JetBrains Mono, ui-monospace, monospace\" font-size=\"{font_size}\" text-anchor=\"start\" dominant-baseline=\"text-before-edge\">"
            ));
            for y in 0..result.rows {
                for x in 0..result.cols {
                    let index = y * result.cols + x;
                    let codepoint = result.codepoints[index];
                    if codepoint == 32 || codepoint == 0x2800 {
                        continue;
                    }
                    let glyph = glyph_for(codepoint);
                    let escaped = escape_xml(glyph);
                    let text = if escaped.is_empty() {
                        glyph.to_string()
                    } else {
                        escaped.to_string()
                    };
                    let fg = result.fg(x, y);
                    let hex = Rgb::new(fg[0], fg[1], fg[2]).to_hex();
                    parts.push(format!(
                        "<text x=\"{}\" y=\"{}\" fill=\"{hex}\">{text}</text>",
                        x * cell_w,
                        y * cell_h
                    ));
                }
            }
            parts.push("</g>".to_string());
        }
    }

    parts.push("</svg>".to_string());
    parts.join("\n")
}

/// Straight RGBA raster of the cell grid.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RasterImage {
    pub width: usize,
    pub height: usize,
    pub rgba: Vec<u8>,
}

impl RasterImage {
    pub fn pixel(&self, x: usize, y: usize) -> [u8; 4] {
        let offset = (y * self.width + x) * 4;
        [
            self.rgba[offset],
            self.rgba[offset + 1],
            self.rgba[offset + 2],
            self.rgba[offset + 3],
        ]
    }
}

fn blend_black(pixel: &mut [u8], alpha: f64) {
    for channel in pixel.iter_mut().take(3) {
        let value = *channel as f64 * (1.0 - alpha);
        *channel = value.clamp(0.0, 255.0) as u8;
    }
}

/// Raster export for block modes. Character modes have no bitmap font in the
/// native engine, so they return `None` and should be exported as SVG/TXT.
pub fn render_blocks_rgba(
    result: &RenderResult,
    cell_aspect_ratio: f32,
    scale: usize,
    include_crt: bool,
) -> Option<RasterImage> {
    let scale = scale.max(1);
    let cell_w = 10 * scale;
    let cell_h = if result.mode == RenderMode::Pixel {
        cell_w
    } else {
        (cell_w as f64 / (cell_aspect_ratio as f64).max(0.25)).round() as usize
    }
    .max(6);

    match result.mode {
        RenderMode::Pixel | RenderMode::HalfBlock => {}
        RenderMode::Ascii | RenderMode::Braille => return None,
    }

    let width = (result.cols * cell_w).max(1);
    let height = (result.rows * cell_h).max(1);
    let mut rgba = vec![0u8; width * height * 4];

    let background = if result.bg_rgba.len() >= 3 {
        [result.bg_rgba[0], result.bg_rgba[1], result.bg_rgba[2]]
    } else {
        [5, 8, 6]
    };

    for pixel in rgba.chunks_exact_mut(4) {
        pixel[..3].copy_from_slice(&background);
        pixel[3] = 255;
    }

    let mut fill_rect = |rx: usize, ry: usize, rw: usize, rh: usize, color: [u8; 4]| {
        for y in ry..(ry + rh).min(height) {
            for x in rx..(rx + rw).min(width) {
                let offset = (y * width + x) * 4;
                rgba[offset] = color[0];
                rgba[offset + 1] = color[1];
                rgba[offset + 2] = color[2];
                rgba[offset + 3] = color[3];
            }
        }
    };

    if result.mode == RenderMode::Pixel {
        for y in 0..result.rows {
            for x in 0..result.cols {
                fill_rect(x * cell_w, y * cell_h, cell_w, cell_h, result.fg(x, y));
            }
        }
    } else {
        let half_h = cell_h.div_ceil(2);
        for y in 0..result.rows {
            for x in 0..result.cols {
                fill_rect(x * cell_w, y * cell_h, cell_w, half_h, result.fg(x, y));
                fill_rect(
                    x * cell_w,
                    y * cell_h + half_h,
                    cell_w,
                    cell_h - half_h,
                    result.bg(x, y),
                );
            }
        }
    }

    if include_crt {
        for y in (0..height).step_by(3) {
            for x in 0..width {
                let offset = (y * width + x) * 4;
                blend_black(&mut rgba[offset..offset + 4], 0.22);
            }
        }

        let center_x = width as f64 / 2.0;
        let center_y = height as f64 / 2.0;
        let inner = (width.min(height) as f64) * 0.3;
        let outer = (width.max(height) as f64) * 0.72;
        for y in 0..height {
            for x in 0..width {
                let dx = x as f64 - center_x;
                let dy = y as f64 - center_y;
                let distance = (dx * dx + dy * dy).sqrt();
                let t = ((distance - inner) / (outer - inner)).clamp(0.0, 1.0);
                if t > 0.0 {
                    let offset = (y * width + x) * 4;
                    blend_black(&mut rgba[offset..offset + 4], 0.45 * t);
                }
            }
        }
    }

    Some(RasterImage {
        width,
        height,
        rgba,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::library::{char_ramp_by_id, palette_by_id};
    use crate::render::process_image;
    use crate::settings::RenderSettings;

    fn render(settings: RenderSettings) -> RenderResult {
        let ramp = char_ramp_by_id(&settings.char_ramp_id);
        let palette = palette_by_id(&settings.palette_id);
        let mut rgba = vec![0u8; 16 * 8 * 4];
        for (index, chunk) in rgba.chunks_exact_mut(4).enumerate() {
            let value = (index * 13 % 256) as u8;
            chunk.copy_from_slice(&[value, value / 2, 255 - value, 255]);
        }
        process_image(&rgba, 16, 8, &settings, &palette, &ramp)
    }

    #[test]
    fn plain_text_has_one_line_per_row() {
        let result = render(RenderSettings {
            mode: RenderMode::Ascii,
            columns: 32,
            ..Default::default()
        });
        let text = to_plain_text(&result);
        assert_eq!(text.lines().count(), result.rows);
        assert_eq!(text.lines().next().unwrap().chars().count(), result.cols);
    }

    #[test]
    fn ansi_sequences_close_every_line() {
        let result = render(RenderSettings {
            mode: RenderMode::Ascii,
            columns: 24,
            ..Default::default()
        });
        for depth in [
            AnsiColorDepth::Ansi16,
            AnsiColorDepth::Ansi256,
            AnsiColorDepth::TrueColor,
        ] {
            let ansi = to_ansi(&result, depth);
            assert_eq!(ansi.lines().count(), result.rows);
            assert!(ansi.contains("\x1b["));
            assert!(ansi.lines().all(|line| line.ends_with("\x1b[0m")));
        }
    }

    #[test]
    fn svg_is_well_formed_and_shaped() {
        let result = render(RenderSettings {
            mode: RenderMode::Ascii,
            columns: 24,
            ..Default::default()
        });
        let svg = to_svg(&result, 0.52);
        assert!(svg.starts_with("<svg xmlns=\"http://www.w3.org/2000/svg\""));
        assert!(svg.ends_with("</svg>"));
        assert_eq!(svg.matches("<text").count(), svg.matches("</text>").count());
    }

    #[test]
    fn pixel_mode_rasterises_blocks() {
        let result = render(RenderSettings {
            mode: RenderMode::Pixel,
            columns: 16,
            ..Default::default()
        });
        let raster = render_blocks_rgba(&result, 1.0, 2, false).expect("pixel raster");
        assert_eq!(raster.width, result.cols * 20);
        assert_eq!(raster.height, result.rows * 20);
        assert_eq!(raster.rgba.len(), raster.width * raster.height * 4);
        assert_eq!(raster.pixel(0, 0)[3], 255);
    }

    #[test]
    fn character_modes_decline_raster() {
        let result = render(RenderSettings {
            mode: RenderMode::Braille,
            columns: 24,
            ..Default::default()
        });
        assert!(render_blocks_rgba(&result, 0.52, 2, false).is_none());
    }
}
