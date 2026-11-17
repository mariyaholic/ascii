//! Ordered/threshold dithering primitives shared by the renderer.

use crate::settings::{DitherAlgorithm, RenderMode};

/// JS `Math.round` is `floor(x + 0.5)`, which differs from Rust's
/// half-away-from-zero rounding for negative halves.
#[inline]
pub fn js_round(value: f64) -> f64 {
    if value.is_finite() {
        (value + 0.5).floor()
    } else {
        value
    }
}

/// Recursively expand a Bayer matrix to `size × size`, normalised to
/// [-0.5, 0.5) exactly like the browser engine builds it.
pub fn build_bayer_matrix(size: usize) -> Vec<f32> {
    let mut matrix: Vec<f32> = vec![0.0];
    let mut n = 1usize;

    while n < size {
        let n2 = n * 2;
        let mut next = vec![0.0f32; n * n * 4];
        for y in 0..n {
            for x in 0..n {
                let v = matrix[y * n + x] * 4.0;
                next[y * n2 + x] = v;
                next[y * n2 + (x + n)] = v + 2.0;
                next[(y + n) * n2 + x] = v + 3.0;
                next[(y + n) * n2 + (x + n)] = v + 1.0;
            }
        }
        matrix = next;
        n = n2;
    }

    let total = size * size;
    matrix
        .iter()
        .take(total)
        .map(|value| (value + 0.5) / total as f32 - 0.5)
        .collect()
}

/// Deterministic 2D hash in [-0.5, 0.5) — flicker-free stochastic dithering.
pub fn stochastic_noise(x: i32, y: i32) -> f64 {
    let mut h = x
        .wrapping_mul(374_761_393)
        .wrapping_add(y.wrapping_mul(668_265_263));
    h = (h ^ (((h as u32) >> 13) as i32)).wrapping_mul(1_274_126_177);
    h ^= ((h as u32) >> 16) as i32;
    ((h as u32) as f64 / 4_294_967_296.0) - 0.5
}

/// Dither offset for a sample position, already scaled by strength.
pub fn ordered_bias(
    algorithm: DitherAlgorithm,
    matrix: Option<&[f32]>,
    size: usize,
    strength: f64,
    x: usize,
    y: usize,
) -> f64 {
    if strength <= 0.0 {
        return 0.0;
    }
    if let Some(matrix) = matrix {
        let cell = matrix[(y % size) * size + (x % size)] as f64;
        return cell * strength;
    }
    if algorithm == DitherAlgorithm::Stochastic {
        return stochastic_noise(x as i32, y as i32) * strength;
    }
    0.0
}

/// Braille dot bitmasks ordered as `[col 0..1][row 0..3]`.
pub const BRAILLE_DOT_BITS: [[u32; 2]; 4] = [
    [0x0001, 0x0008],
    [0x0002, 0x0010],
    [0x0004, 0x0020],
    [0x0040, 0x0080],
];

/// Number of tone steps used when diffusing luminance for a render mode.
pub fn glyph_steps(mode: RenderMode, ramp_len: usize) -> usize {
    match mode {
        RenderMode::Braille => 2,
        _ => ramp_len.max(2),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bayer_2x2_is_the_canonical_normalised_matrix() {
        let matrix = build_bayer_matrix(2);
        assert_eq!(matrix.len(), 4);
        let expected = [-0.375, 0.125, 0.375, -0.125];
        for (actual, expected) in matrix.iter().zip(expected) {
            assert!((actual - expected).abs() < 1e-6);
        }
    }

    #[test]
    fn bayer_rows_are_permutations() {
        for size in [4usize, 8, 16] {
            let matrix = build_bayer_matrix(size);
            assert_eq!(matrix.len(), size * size);
            let mut sorted = matrix.clone();
            sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
            for (index, value) in sorted.iter().enumerate() {
                let expected = (index as f32 + 0.5) / (size * size) as f32 - 0.5;
                assert!((value - expected).abs() < 1e-6);
            }
        }
    }

    #[test]
    fn noise_is_deterministic_and_bounded() {
        for x in 0..16 {
            for y in 0..16 {
                let first = stochastic_noise(x, y);
                assert_eq!(first, stochastic_noise(x, y));
                assert!((-0.5..0.5).contains(&first));
            }
        }
    }

    #[test]
    fn js_round_matches_javascript() {
        assert_eq!(js_round(0.5), 1.0);
        assert_eq!(js_round(-0.5), 0.0);
        assert_eq!(js_round(-1.5), -1.0);
        assert_eq!(js_round(2.49), 2.0);
    }
}
