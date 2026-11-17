//! Image → cell-grid renderer. This is a line-for-line port of
//! `src/engine/imageProcessor.ts`; tone, dithering and glyph selection must stay
//! numerically identical so presets look the same in the browser and desktop app.

use std::time::Instant;

use crate::dither::{build_bayer_matrix, glyph_steps, js_round, ordered_bias, BRAILLE_DOT_BITS};
use crate::library::{CharRamp, Palette};
use crate::settings::{ColorMode, DitherAlgorithm, RenderMode, RenderSettings};

pub const BLOCK_GLYPH: u32 = 0x2588; // █
pub const HALF_BLOCK_GLYPH: u32 = 0x2580; // ▀

#[derive(Clone, Debug, PartialEq)]
pub struct RenderResult {
    pub cols: usize,
    pub rows: usize,
    pub mode: RenderMode,
    pub codepoints: Vec<u32>,
    /// Foreground RGBA, one entry per cell.
    pub fg_rgba: Vec<u8>,
    /// Background RGBA, one entry per cell.
    pub bg_rgba: Vec<u8>,
    pub render_time_ms: f64,
}

impl RenderResult {
    pub fn cell_count(&self) -> usize {
        self.cols * self.rows
    }

    pub fn glyph(&self, x: usize, y: usize) -> char {
        let index = y * self.cols + x;
        self.codepoints
            .get(index)
            .and_then(|cp| char::from_u32(*cp))
            .unwrap_or(' ')
    }

    pub fn fg(&self, x: usize, y: usize) -> [u8; 4] {
        let offset = (y * self.cols + x) * 4;
        [
            self.fg_rgba[offset],
            self.fg_rgba[offset + 1],
            self.fg_rgba[offset + 2],
            self.fg_rgba[offset + 3],
        ]
    }

    pub fn bg(&self, x: usize, y: usize) -> [u8; 4] {
        let offset = (y * self.cols + x) * 4;
        [
            self.bg_rgba[offset],
            self.bg_rgba[offset + 1],
            self.bg_rgba[offset + 2],
            self.bg_rgba[offset + 3],
        ]
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct TargetDimensions {
    pub cols: usize,
    pub rows: usize,
    pub sample_w: usize,
    pub sample_h: usize,
}

pub fn compute_target_dimensions(
    src_w: u32,
    src_h: u32,
    settings: &RenderSettings,
) -> TargetDimensions {
    let safe_w = src_w.max(1);
    let safe_h = src_h.max(1);
    let aspect = safe_h as f64 / safe_w as f64;

    let mut cols = js_round(settings.columns as f64).clamp(16.0, 320.0) as usize;
    if settings.native_one_to_one {
        cols = if settings.mode == RenderMode::Braille {
            js_round((safe_w as f64 / 2.0).ceil()).clamp(16.0, 320.0) as usize
        } else {
            (safe_w as f64).clamp(16.0, 320.0) as usize
        };
    }

    let cols_f = cols as f64;
    let aspect_ratio = settings.cell_aspect_ratio as f64;

    match settings.mode {
        RenderMode::Pixel => {
            let rows = js_round(cols_f * aspect).max(1.0) as usize;
            TargetDimensions {
                cols,
                rows,
                sample_w: cols,
                sample_h: rows,
            }
        }
        RenderMode::HalfBlock => {
            let rows = js_round(cols_f * aspect * aspect_ratio).max(1.0) as usize;
            TargetDimensions {
                cols,
                rows,
                sample_w: cols,
                sample_h: rows * 2,
            }
        }
        RenderMode::Braille => {
            let rows = js_round(cols_f * aspect * aspect_ratio).max(1.0) as usize;
            TargetDimensions {
                cols,
                rows,
                sample_w: cols * 2,
                sample_h: rows * 4,
            }
        }
        RenderMode::Ascii => {
            let rows = js_round(cols_f * aspect * aspect_ratio).max(1.0) as usize;
            TargetDimensions {
                cols,
                rows,
                sample_w: cols,
                sample_h: rows,
            }
        }
    }
}

#[inline]
pub fn relative_luminance(r: f64, g: f64, b: f64) -> f64 {
    (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255.0
}

/// Area-average downsample into a planar RGB f32 buffer, alpha-weighted.
fn area_downsample(src: &[u8], src_w: usize, src_h: usize, dst_w: usize, dst_h: usize) -> Vec<f32> {
    let mut out = vec![0.0f32; dst_w * dst_h * 3];
    let scale_x = src_w as f64 / dst_w as f64;
    let scale_y = src_h as f64 / dst_h as f64;

    for dy in 0..dst_h {
        let sy0 = dy as f64 * scale_y;
        let sy1 = (dy as f64 + 1.0) * scale_y;
        let y_start = sy0.floor().max(0.0) as usize;
        let y_end = ((sy1 - 1e-6).floor() as isize).clamp(0, src_h as isize - 1) as usize;

        for dx in 0..dst_w {
            let sx0 = dx as f64 * scale_x;
            let sx1 = (dx as f64 + 1.0) * scale_x;
            let x_start = sx0.floor().max(0.0) as usize;
            let x_end = ((sx1 - 1e-6).floor() as isize).clamp(0, src_w as isize - 1) as usize;

            let mut r_sum = 0.0f64;
            let mut g_sum = 0.0f64;
            let mut b_sum = 0.0f64;
            let mut count = 0usize;

            for sy in y_start..=y_end {
                let row_offset = sy * src_w;
                for sx in x_start..=x_end {
                    let index = (row_offset + sx) * 4;
                    let alpha = src[index + 3] as f64 / 255.0;
                    r_sum += src[index] as f64 * alpha;
                    g_sum += src[index + 1] as f64 * alpha;
                    b_sum += src[index + 2] as f64 * alpha;
                    count += 1;
                }
            }

            if count == 0 {
                let sx = (sx0.floor() as usize).min(src_w - 1);
                let sy = (sy0.floor() as usize).min(src_h - 1);
                let index = (sy * src_w + sx) * 4;
                let alpha = src[index + 3] as f64 / 255.0;
                r_sum = src[index] as f64 * alpha;
                g_sum = src[index + 1] as f64 * alpha;
                b_sum = src[index + 2] as f64 * alpha;
                count = 1;
            }

            let offset = (dy * dst_w + dx) * 3;
            out[offset] = (r_sum / count as f64) as f32;
            out[offset + 1] = (g_sum / count as f64) as f32;
            out[offset + 2] = (b_sum / count as f64) as f32;
        }
    }

    out
}

fn apply_box_blur(buf: &[f32], width: usize, height: usize, radius: f32) -> Vec<f32> {
    if radius <= 0.0 {
        return buf.to_vec();
    }
    let r = js_round(radius as f64).clamp(0.0, 6.0) as usize;
    let mut temp = vec![0.0f32; buf.len()];
    let mut out = vec![0.0f32; buf.len()];

    for y in 0..height {
        for x in 0..width {
            let x0 = x.saturating_sub(r);
            let x1 = (x + r).min(width - 1);
            let mut sums = [0.0f64; 3];
            let mut count = 0usize;
            for kx in x0..=x1 {
                let index = (y * width + kx) * 3;
                for channel in 0..3 {
                    sums[channel] += buf[index + channel] as f64;
                }
                count += 1;
            }
            let offset = (y * width + x) * 3;
            for channel in 0..3 {
                temp[offset + channel] = (sums[channel] / count as f64) as f32;
            }
        }
    }

    for y in 0..height {
        let y0 = y.saturating_sub(r);
        let y1 = (y + r).min(height - 1);
        for x in 0..width {
            let mut sums = [0.0f64; 3];
            let mut count = 0usize;
            for ky in y0..=y1 {
                let index = (ky * width + x) * 3;
                for channel in 0..3 {
                    sums[channel] += temp[index + channel] as f64;
                }
                count += 1;
            }
            let offset = (y * width + x) * 3;
            for channel in 0..3 {
                out[offset + channel] = (sums[channel] / count as f64) as f32;
            }
        }
    }

    out
}

fn apply_edge_boost(buf: &[f32], width: usize, height: usize, amount: f32) -> Vec<f32> {
    if amount <= 0.0 {
        return buf.to_vec();
    }
    let strength = (amount as f64 / 100.0) * 1.4;
    let mut out = buf.to_vec();

    for y in 1..height.saturating_sub(1) {
        for x in 1..width.saturating_sub(1) {
            let index = (y * width + x) * 3;
            let top = ((y - 1) * width + x) * 3;
            let bottom = ((y + 1) * width + x) * 3;
            let left = (y * width + (x - 1)) * 3;
            let right = (y * width + (x + 1)) * 3;

            for channel in 0..3 {
                let center = buf[index + channel] as f64;
                let neighbours = (buf[top + channel] as f64
                    + buf[bottom + channel] as f64
                    + buf[left + channel] as f64
                    + buf[right + channel] as f64)
                    * 0.25;
                let value = center + (center - neighbours) * strength;
                out[index + channel] = value.clamp(0.0, 255.0) as f32;
            }
        }
    }

    out
}

struct ErrorKernel {
    divisor: f64,
    offsets: &'static [(i32, i32, f64)],
}

const FLOYD_STEINBERG: ErrorKernel = ErrorKernel {
    divisor: 16.0,
    offsets: &[(1, 0, 7.0), (-1, 1, 3.0), (0, 1, 5.0), (1, 1, 1.0)],
};

const ATKINSON: ErrorKernel = ErrorKernel {
    divisor: 8.0,
    offsets: &[
        (1, 0, 1.0),
        (2, 0, 1.0),
        (-1, 1, 1.0),
        (0, 1, 1.0),
        (1, 1, 1.0),
        (0, 2, 1.0),
    ],
};

const STUCKI: ErrorKernel = ErrorKernel {
    divisor: 42.0,
    offsets: &[
        (1, 0, 8.0),
        (2, 0, 4.0),
        (-2, 1, 2.0),
        (-1, 1, 4.0),
        (0, 1, 8.0),
        (1, 1, 4.0),
        (2, 1, 2.0),
        (-2, 2, 1.0),
        (-1, 2, 2.0),
        (0, 2, 4.0),
        (1, 2, 2.0),
        (2, 2, 1.0),
    ],
};

fn kernel_for(algorithm: DitherAlgorithm) -> Option<&'static ErrorKernel> {
    match algorithm {
        DitherAlgorithm::FloydSteinberg => Some(&FLOYD_STEINBERG),
        DitherAlgorithm::Atkinson => Some(&ATKINSON),
        DitherAlgorithm::Stucki => Some(&STUCKI),
        _ => None,
    }
}

/// Perceptual "redmean" distance, matching the browser's nearest-color search.
fn nearest_palette_index(r: f64, g: f64, b: f64, palette: &[[u8; 3]]) -> usize {
    let mut best_index = 0usize;
    let mut best_distance = f64::INFINITY;

    for (index, color) in palette.iter().enumerate() {
        let (pr, pg, pb) = (color[0] as f64, color[1] as f64, color[2] as f64);
        let r_mean = (r + pr) * 0.5;
        let dr = r - pr;
        let dg = g - pg;
        let db = b - pb;
        let distance = ((512.0 + r_mean) * dr * dr) / 256.0
            + 4.0 * dg * dg
            + ((767.0 - r_mean) * db * db) / 256.0;
        if distance < best_distance {
            best_distance = distance;
            best_index = index;
        }
    }

    best_index
}

/// Render an RGBA buffer into the studio's cell grid.
pub fn process_image(
    src_rgba: &[u8],
    src_w: u32,
    src_h: u32,
    settings: &RenderSettings,
    palette: &Palette,
    ramp: &CharRamp,
) -> RenderResult {
    let started = Instant::now();
    let src_w = src_w.max(1) as usize;
    let src_h = src_h.max(1) as usize;

    let dims = compute_target_dimensions(src_w as u32, src_h as u32, settings);
    let TargetDimensions {
        cols,
        rows,
        sample_w,
        sample_h,
    } = dims;

    let mut buf = area_downsample(src_rgba, src_w, src_h, sample_w, sample_h);

    if settings.blur_radius > 0 {
        buf = apply_box_blur(&buf, sample_w, sample_h, settings.blur_radius as f32);
    }
    if settings.edge_boost > 0.0 {
        buf = apply_edge_boost(&buf, sample_w, sample_h, settings.edge_boost);
    }

    // Tone: brightness, contrast, gamma, posterise, invert.
    let bright_offset = (settings.brightness as f64 / 100.0) * 255.0;
    let c_norm = (settings.contrast as f64 / 100.0) * 255.0;
    let contrast_factor = (259.0 * (c_norm + 255.0)) / (255.0 * (259.0 - c_norm));
    let inv_gamma = 1.0 / (settings.gamma as f64).max(0.2);
    let posterize = if settings.posterize_levels >= 2 {
        settings.posterize_levels
    } else {
        0
    };
    let posterize_step = if posterize > 0 {
        255.0 / (posterize as f64 - 1.0)
    } else {
        0.0
    };

    let total_samples = sample_w * sample_h;
    for channel in buf.iter_mut() {
        let mut value = *channel as f64;
        value += bright_offset;
        value = contrast_factor * (value - 128.0) + 128.0;
        value = value.clamp(0.0, 255.0);
        value = 255.0 * (value / 255.0).powf(inv_gamma);
        if posterize > 0 {
            value = js_round(value / posterize_step) * posterize_step;
        }
        if settings.inverse {
            value = 255.0 - value;
        }
        *channel = value.clamp(0.0, 255.0) as f32;
    }

    let palette_rgb: Vec<[u8; 3]> = if palette.colors.is_empty() {
        vec![[0, 0, 0], [255, 255, 255]]
    } else {
        palette.colors.iter().map(|c| c.channels()).collect()
    };

    let mono_fg = settings.mono_foreground.channels();
    let mono_bg = settings.background.channels();

    let bayer_size = settings.dither_algorithm.bayer_size();
    let bayer_matrix = if bayer_size > 0 {
        Some(build_bayer_matrix(bayer_size))
    } else {
        None
    };
    let dither_norm = settings.dither_strength as f64 / 100.0;
    let use_error_diffusion = settings.dither_algorithm.is_error_diffusion() && dither_norm > 0.0;
    let kernel = kernel_for(settings.dither_algorithm);

    let quantize = |r: f64, g: f64, b: f64, bias: f64| -> [u8; 3] {
        let cr = r.clamp(0.0, 255.0);
        let cg = g.clamp(0.0, 255.0);
        let cb = b.clamp(0.0, 255.0);

        match settings.color_mode {
            ColorMode::TrueColor => {
                if posterize > 0 {
                    let quant = |value: f64| {
                        (js_round((value + bias * posterize_step) / posterize_step)
                            * posterize_step)
                            .clamp(0.0, 255.0) as u8
                    };
                    [quant(cr), quant(cg), quant(cb)]
                } else {
                    [js_round(cr) as u8, js_round(cg) as u8, js_round(cb) as u8]
                }
            }
            ColorMode::Grayscale => {
                let lum = relative_luminance(cr, cg, cb);
                let levels = if posterize >= 2 {
                    posterize as f64
                } else {
                    16.0
                };
                let q = (js_round((lum + bias / (levels - 1.0)) * (levels - 1.0)) / (levels - 1.0))
                    .clamp(0.0, 1.0);
                let value = js_round(q * 255.0).clamp(0.0, 255.0) as u8;
                [value, value, value]
            }
            ColorMode::Palette => {
                let spread = bias * 96.0;
                let index = nearest_palette_index(
                    (cr + spread).clamp(0.0, 255.0),
                    (cg + spread).clamp(0.0, 255.0),
                    (cb + spread).clamp(0.0, 255.0),
                    &palette_rgb,
                );
                palette_rgb[index]
            }
            ColorMode::Mono => {
                let lum = relative_luminance(cr, cg, cb);
                let on = lum + bias >= 0.5;
                if on {
                    mono_fg
                } else {
                    mono_bg
                }
            }
        }
    };

    let chars: Vec<char> = if ramp.chars.is_empty() {
        " .:-=+*#%@".chars().collect()
    } else {
        ramp.chars.clone()
    };
    let ramp_len = chars.len();

    let mut quantized_rgb = vec![0u8; total_samples * 3];
    let mut dithered_lum = vec![0.0f32; total_samples];

    if use_error_diffusion {
        if let Some(kernel) = kernel {
            let mut rgb_work: Vec<f32> = buf.clone();
            let mut lum_work: Vec<f32> = (0..total_samples)
                .map(|index| {
                    relative_luminance(
                        buf[index * 3] as f64,
                        buf[index * 3 + 1] as f64,
                        buf[index * 3 + 2] as f64,
                    ) as f32
                })
                .collect();

            for y in 0..sample_h {
                let reverse = settings.serpentine && y % 2 == 1;
                for step_x in 0..sample_w {
                    let x = if reverse {
                        sample_w - 1 - step_x
                    } else {
                        step_x
                    };
                    let pixel = y * sample_w + x;
                    let rgb_index = pixel * 3;

                    let old_r = rgb_work[rgb_index] as f64;
                    let old_g = rgb_work[rgb_index + 1] as f64;
                    let old_b = rgb_work[rgb_index + 2] as f64;
                    let new = quantize(old_r, old_g, old_b, 0.0);

                    quantized_rgb[rgb_index] = new[0];
                    quantized_rgb[rgb_index + 1] = new[1];
                    quantized_rgb[rgb_index + 2] = new[2];

                    let err_r = (old_r - new[0] as f64) * dither_norm;
                    let err_g = (old_g - new[1] as f64) * dither_norm;
                    let err_b = (old_b - new[2] as f64) * dither_norm;

                    let old_lum = (lum_work[pixel] as f64).clamp(0.0, 1.0);
                    let steps = glyph_steps(settings.mode, ramp_len) as f64;
                    let q_lum = js_round(old_lum * (steps - 1.0)) / (steps - 1.0);
                    dithered_lum[pixel] = q_lum as f32;
                    let err_lum = (old_lum - q_lum) * dither_norm;

                    for &(dx_raw, dy, weight) in kernel.offsets {
                        let dx = if reverse { -dx_raw } else { dx_raw };
                        let nx = x as i32 + dx;
                        let ny = y as i32 + dy;
                        if nx >= 0 && nx < sample_w as i32 && ny >= 0 && ny < sample_h as i32 {
                            let factor = weight / kernel.divisor;
                            let neighbour = (ny as usize) * sample_w + nx as usize;
                            let neighbour_rgb = neighbour * 3;
                            rgb_work[neighbour_rgb] =
                                (rgb_work[neighbour_rgb] as f64 + err_r * factor) as f32;
                            rgb_work[neighbour_rgb + 1] =
                                (rgb_work[neighbour_rgb + 1] as f64 + err_g * factor) as f32;
                            rgb_work[neighbour_rgb + 2] =
                                (rgb_work[neighbour_rgb + 2] as f64 + err_b * factor) as f32;
                            lum_work[neighbour] =
                                (lum_work[neighbour] as f64 + err_lum * factor) as f32;
                        }
                    }
                }
            }
        }
    } else {
        for y in 0..sample_h {
            for x in 0..sample_w {
                let pixel = y * sample_w + x;
                let rgb_index = pixel * 3;
                let bias = ordered_bias(
                    settings.dither_algorithm,
                    bayer_matrix.as_deref(),
                    bayer_size,
                    dither_norm,
                    x,
                    y,
                );
                let r = buf[rgb_index] as f64;
                let g = buf[rgb_index + 1] as f64;
                let b = buf[rgb_index + 2] as f64;

                let quantized = quantize(r, g, b, bias);
                quantized_rgb[rgb_index] = quantized[0];
                quantized_rgb[rgb_index + 1] = quantized[1];
                quantized_rgb[rgb_index + 2] = quantized[2];

                let lum = relative_luminance(r, g, b);
                if settings.mode == RenderMode::Braille {
                    dithered_lum[pixel] = if lum + bias >= 0.5 { 1.0 } else { 0.0 };
                } else {
                    let steps = ramp_len.max(2) as f64;
                    let q = (js_round((lum + bias / (steps - 1.0)).clamp(0.0, 1.0) * (steps - 1.0))
                        / (steps - 1.0)) as f32;
                    dithered_lum[pixel] = q;
                }
            }
        }
    }

    let cell_count = cols * rows;
    let mut codepoints = vec![0u32; cell_count];
    let mut fg_rgba = vec![0u8; cell_count * 4];
    let mut bg_rgba = vec![0u8; cell_count * 4];

    match settings.mode {
        RenderMode::Pixel => {
            for (cell, codepoint) in codepoints.iter_mut().enumerate() {
                *codepoint = BLOCK_GLYPH;
                let sample = cell * 3;
                let out = cell * 4;
                let rgb = [
                    quantized_rgb[sample],
                    quantized_rgb[sample + 1],
                    quantized_rgb[sample + 2],
                ];
                fg_rgba[out..out + 3].copy_from_slice(&rgb);
                bg_rgba[out..out + 3].copy_from_slice(&rgb);
                fg_rgba[out + 3] = 255;
                bg_rgba[out + 3] = 255;
            }
        }
        RenderMode::HalfBlock => {
            for y in 0..rows {
                for x in 0..cols {
                    let cell = y * cols + x;
                    let top = ((y * 2) * sample_w + x) * 3;
                    let bottom = ((y * 2 + 1) * sample_w + x) * 3;
                    let out = cell * 4;

                    codepoints[cell] = HALF_BLOCK_GLYPH;
                    fg_rgba[out..out + 3].copy_from_slice(&quantized_rgb[top..top + 3]);
                    bg_rgba[out..out + 3].copy_from_slice(&quantized_rgb[bottom..bottom + 3]);
                    fg_rgba[out + 3] = 255;
                    bg_rgba[out + 3] = 255;
                }
            }
        }
        RenderMode::Braille => {
            for y in 0..rows {
                for x in 0..cols {
                    let cell = y * cols + x;
                    let mut mask = 0u32;
                    let mut sums = [0u32; 3];
                    let mut lit = 0u32;

                    for (dy, row) in BRAILLE_DOT_BITS.iter().enumerate() {
                        for (dx, dot) in row.iter().enumerate() {
                            let sx = x * 2 + dx;
                            let sy = y * 4 + dy;
                            let sample = sy * sample_w + sx;
                            if dithered_lum[sample] >= 0.5 {
                                mask |= dot;
                                let rgb = sample * 3;
                                for (channel, sum) in sums.iter_mut().enumerate() {
                                    *sum += quantized_rgb[rgb + channel] as u32;
                                }
                                lit += 1;
                            }
                        }
                    }

                    codepoints[cell] = 0x2800 + mask;
                    let out = cell * 4;
                    if settings.color_mode == ColorMode::Mono {
                        fg_rgba[out] = mono_fg[0];
                        fg_rgba[out + 1] = mono_fg[1];
                        fg_rgba[out + 2] = mono_fg[2];
                    } else if lit > 0 {
                        for (channel, sum) in sums.iter().enumerate() {
                            fg_rgba[out + channel] = js_round(*sum as f64 / lit as f64) as u8;
                        }
                    } else {
                        let fallback = ((y * 4) * sample_w + x * 2) * 3;
                        fg_rgba[out..out + 3]
                            .copy_from_slice(&quantized_rgb[fallback..fallback + 3]);
                    }
                    fg_rgba[out + 3] = 255;

                    bg_rgba[out] = mono_bg[0];
                    bg_rgba[out + 1] = mono_bg[1];
                    bg_rgba[out + 2] = mono_bg[2];
                    bg_rgba[out + 3] = 255;
                }
            }
        }
        RenderMode::Ascii => {
            for cell in 0..cell_count {
                let lum = (dithered_lum[cell] as f64).clamp(0.0, 1.0);
                let ramp_index = js_round(lum * (ramp_len as f64 - 1.0))
                    .clamp(0.0, ramp_len as f64 - 1.0) as usize;
                codepoints[cell] = chars[ramp_index] as u32;

                let out = cell * 4;
                let sample = cell * 3;
                if settings.color_mode == ColorMode::Mono {
                    fg_rgba[out] = mono_fg[0];
                    fg_rgba[out + 1] = mono_fg[1];
                    fg_rgba[out + 2] = mono_fg[2];
                } else {
                    fg_rgba[out] = quantized_rgb[sample];
                    fg_rgba[out + 1] = quantized_rgb[sample + 1];
                    fg_rgba[out + 2] = quantized_rgb[sample + 2];
                }
                fg_rgba[out + 3] = 255;

                bg_rgba[out] = mono_bg[0];
                bg_rgba[out + 1] = mono_bg[1];
                bg_rgba[out + 2] = mono_bg[2];
                bg_rgba[out + 3] = 255;
            }
        }
    }

    RenderResult {
        cols,
        rows,
        mode: settings.mode,
        codepoints,
        fg_rgba,
        bg_rgba,
        render_time_ms: started.elapsed().as_secs_f64() * 1000.0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::library::{char_ramp_by_id, palette_by_id};

    fn synthetic(width: u32, height: u32) -> Vec<u8> {
        let mut data = Vec::with_capacity((width * height * 4) as usize);
        for y in 0..height {
            for x in 0..width {
                let r = ((x * 7 + y * 3) % 256) as u8;
                let g = ((x * 2 + y * 11) % 256) as u8;
                let b = ((x * 5 + y * 5) % 256) as u8;
                data.extend_from_slice(&[r, g, b, 255]);
            }
        }
        data
    }

    fn render(settings: &RenderSettings) -> RenderResult {
        let ramp = char_ramp_by_id(&settings.char_ramp_id);
        let palette = palette_by_id(&settings.palette_id);
        process_image(&synthetic(24, 16), 24, 16, settings, &palette, &ramp)
    }

    #[test]
    fn dimensions_follow_mode_and_aspect() {
        let mut settings = RenderSettings {
            columns: 100,
            ..Default::default()
        };

        settings.mode = RenderMode::Pixel;
        let pixel = compute_target_dimensions(200, 100, &settings);
        assert_eq!(pixel.cols, 100);
        assert_eq!(pixel.rows, 50);
        assert_eq!(pixel.sample_w, 100);

        settings.mode = RenderMode::HalfBlock;
        let half = compute_target_dimensions(200, 100, &settings);
        assert_eq!(half.rows, (100.0 * 0.5 * 0.52f32 as f64).round() as usize);
        assert_eq!(half.sample_h, half.rows * 2);

        settings.mode = RenderMode::Braille;
        let braille = compute_target_dimensions(200, 100, &settings);
        assert_eq!(braille.sample_w, braille.cols * 2);
        assert_eq!(braille.sample_h, braille.rows * 4);
    }

    #[test]
    fn native_one_to_one_uses_source_width() {
        let mut settings = RenderSettings {
            native_one_to_one: true,
            ..Default::default()
        };
        settings.mode = RenderMode::Pixel;
        let dims = compute_target_dimensions(90, 40, &settings);
        assert_eq!(dims.cols, 90);

        settings.mode = RenderMode::Braille;
        let dims = compute_target_dimensions(90, 40, &settings);
        assert_eq!(dims.cols, 45);
    }

    #[test]
    fn cell_buffers_are_consistent() {
        for mode in RenderMode::ALL {
            let settings = RenderSettings {
                mode,
                columns: 48,
                ..Default::default()
            };
            let result = render(&settings);
            assert_eq!(result.codepoints.len(), result.cell_count());
            assert_eq!(result.fg_rgba.len(), result.cell_count() * 4);
            assert_eq!(result.bg_rgba.len(), result.cell_count() * 4);
            assert!(result.cols >= 16);
        }
    }

    #[test]
    fn output_is_deterministic() {
        let settings = RenderSettings::default();
        let first = render(&settings);
        let second = render(&settings);
        assert_eq!(first.codepoints, second.codepoints);
        assert_eq!(first.fg_rgba, second.fg_rgba);
    }

    #[test]
    fn pixel_mode_paints_one_quad_per_cell() {
        let settings = RenderSettings {
            mode: RenderMode::Pixel,
            ..Default::default()
        };
        let result = render(&settings);
        for (cell, codepoint) in result.codepoints.iter().enumerate() {
            assert_eq!(*codepoint, BLOCK_GLYPH);
            let out = cell * 4;
            assert_eq!(result.fg_rgba[out..out + 3], result.bg_rgba[out..out + 3]);
            assert_eq!(result.fg_rgba[out + 3], 255);
        }
    }

    #[test]
    fn mono_ascii_only_emits_ramp_glyphs() {
        let settings = RenderSettings {
            color_mode: ColorMode::Mono,
            mode: RenderMode::Ascii,
            ..Default::default()
        };
        let ramp = char_ramp_by_id(&settings.char_ramp_id);
        let result = render(&settings);
        for codepoint in &result.codepoints {
            let glyph = char::from_u32(*codepoint).unwrap();
            assert!(ramp.chars.contains(&glyph));
        }
    }

    #[test]
    fn inversion_flips_luminance_extremes() {
        let mut settings = RenderSettings {
            mode: RenderMode::Pixel,
            color_mode: ColorMode::Grayscale,
            ..Default::default()
        };

        let normal = render(&settings);
        settings.inverse = true;
        let inverted = render(&settings);

        // Pixel mode always emits the full-block glyph, so tone is the signal.
        assert_ne!(normal.fg_rgba, inverted.fg_rgba);
        let first = normal.fg(0, 0)[0];
        let flipped = inverted.fg(0, 0)[0];
        assert!(flipped.abs_diff(first) > 20, "inverse should change tone");
    }

    #[test]
    fn braillage_masks_stay_in_unicode_block() {
        let settings = RenderSettings {
            mode: RenderMode::Braille,
            color_mode: ColorMode::Mono,
            ..Default::default()
        };
        let result = render(&settings);
        for codepoint in &result.codepoints {
            assert!(
                (0x2800..=0x28FF).contains(codepoint),
                "codepoint {codepoint:#x}"
            );
        }
    }
}
