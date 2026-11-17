use std::fmt;

/// Render target: square pixels, character ramps, half blocks or braille.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RenderMode {
    Pixel,
    Ascii,
    HalfBlock,
    Braille,
}

impl RenderMode {
    pub const ALL: [RenderMode; 4] = [
        RenderMode::Pixel,
        RenderMode::Ascii,
        RenderMode::HalfBlock,
        RenderMode::Braille,
    ];

    pub fn id(self) -> &'static str {
        match self {
            RenderMode::Pixel => "pixel",
            RenderMode::Ascii => "ascii",
            RenderMode::HalfBlock => "halfblock",
            RenderMode::Braille => "braille",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            RenderMode::Pixel => "Pixel",
            RenderMode::Ascii => "ASCII",
            RenderMode::HalfBlock => "Half-Block",
            RenderMode::Braille => "Braille",
        }
    }

    pub fn from_id(id: &str) -> Option<Self> {
        match id {
            "pixel" => Some(RenderMode::Pixel),
            "ascii" => Some(RenderMode::Ascii),
            "halfblock" => Some(RenderMode::HalfBlock),
            "braille" => Some(RenderMode::Braille),
            _ => None,
        }
    }
}

/// Dithering strategies. Ordered matrices, a deterministic hash, and the three
/// error-diffusion kernels the studio exposes.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DitherAlgorithm {
    None,
    Bayer2,
    Bayer4,
    Bayer8,
    Bayer16,
    Stochastic,
    FloydSteinberg,
    Atkinson,
    Stucki,
}

impl DitherAlgorithm {
    pub const ALL: [DitherAlgorithm; 9] = [
        DitherAlgorithm::None,
        DitherAlgorithm::Bayer2,
        DitherAlgorithm::Bayer4,
        DitherAlgorithm::Bayer8,
        DitherAlgorithm::Bayer16,
        DitherAlgorithm::Stochastic,
        DitherAlgorithm::FloydSteinberg,
        DitherAlgorithm::Atkinson,
        DitherAlgorithm::Stucki,
    ];

    pub fn id(self) -> &'static str {
        match self {
            DitherAlgorithm::None => "none",
            DitherAlgorithm::Bayer2 => "bayer2",
            DitherAlgorithm::Bayer4 => "bayer4",
            DitherAlgorithm::Bayer8 => "bayer8",
            DitherAlgorithm::Bayer16 => "bayer16",
            DitherAlgorithm::Stochastic => "stochastic",
            DitherAlgorithm::FloydSteinberg => "floyd-steinberg",
            DitherAlgorithm::Atkinson => "atkinson",
            DitherAlgorithm::Stucki => "stucki",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            DitherAlgorithm::None => "None (Direct Quantise)",
            DitherAlgorithm::Bayer2 => "Bayer 2x2 (Ordered)",
            DitherAlgorithm::Bayer4 => "Bayer 4x4 (Ordered)",
            DitherAlgorithm::Bayer8 => "Bayer 8x8 (Ordered)",
            DitherAlgorithm::Bayer16 => "Bayer 16x16 (Fine)",
            DitherAlgorithm::Stochastic => "Stochastic (Blue-Noise Hash)",
            DitherAlgorithm::FloydSteinberg => "Floyd-Steinberg",
            DitherAlgorithm::Atkinson => "Atkinson (Classic Mac)",
            DitherAlgorithm::Stucki => "Stucki (Smooth)",
        }
    }

    pub fn from_id(id: &str) -> Option<Self> {
        DitherAlgorithm::ALL.iter().copied().find(|a| a.id() == id)
    }

    pub fn bayer_size(self) -> usize {
        match self {
            DitherAlgorithm::Bayer2 => 2,
            DitherAlgorithm::Bayer4 => 4,
            DitherAlgorithm::Bayer8 => 8,
            DitherAlgorithm::Bayer16 => 16,
            _ => 0,
        }
    }

    pub fn is_error_diffusion(self) -> bool {
        matches!(
            self,
            DitherAlgorithm::FloydSteinberg | DitherAlgorithm::Atkinson | DitherAlgorithm::Stucki
        )
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ColorMode {
    Mono,
    Grayscale,
    Palette,
    TrueColor,
}

impl ColorMode {
    pub const ALL: [ColorMode; 4] = [
        ColorMode::Mono,
        ColorMode::Grayscale,
        ColorMode::Palette,
        ColorMode::TrueColor,
    ];

    pub fn id(self) -> &'static str {
        match self {
            ColorMode::Mono => "mono",
            ColorMode::Grayscale => "grayscale",
            ColorMode::Palette => "palette",
            ColorMode::TrueColor => "truecolor",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            ColorMode::Mono => "Mono",
            ColorMode::Grayscale => "Gray",
            ColorMode::Palette => "Palette",
            ColorMode::TrueColor => "TrueColor",
        }
    }

    pub fn from_id(id: &str) -> Option<Self> {
        ColorMode::ALL.iter().copied().find(|m| m.id() == id)
    }
}

/// sRGB triplet with the studio's hex parsing rules.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Rgb {
    pub r: u8,
    pub g: u8,
    pub b: u8,
}

impl Rgb {
    pub const fn new(r: u8, g: u8, b: u8) -> Self {
        Self { r, g, b }
    }

    /// Accepts `#RGB`, `#RRGGBB` and bare variants; falls back to white.
    pub fn from_hex(hex: &str) -> Self {
        let clean = hex.trim().trim_start_matches('#');
        let parse = |slice: &str| u8::from_str_radix(slice, 16).unwrap_or(0);

        match clean.len() {
            3 => Self::new(
                parse(&clean[0..1].repeat(2)),
                parse(&clean[1..2].repeat(2)),
                parse(&clean[2..3].repeat(2)),
            ),
            n if n >= 6 => Self::new(
                parse(&clean[0..2]),
                parse(&clean[2..4]),
                parse(&clean[4..6]),
            ),
            _ => Self::new(255, 255, 255),
        }
    }

    pub fn to_hex(self) -> String {
        format!("#{:02X}{:02X}{:02X}", self.r, self.g, self.b)
    }

    pub fn channels(self) -> [u8; 3] {
        [self.r, self.g, self.b]
    }
}

impl Default for Rgb {
    fn default() -> Self {
        Self::new(255, 255, 255)
    }
}

impl fmt::Display for Rgb {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.to_hex())
    }
}

/// Full render recipe. Mirrors `RenderSettings` in `src/types/studio.ts`, so a
/// saved studio preset can be fed to the native build unchanged.
#[derive(Clone, Debug, PartialEq)]
pub struct RenderSettings {
    pub mode: RenderMode,
    pub auto_fit: bool,
    pub native_one_to_one: bool,
    pub columns: u32,
    pub cell_aspect_ratio: f32,
    pub blur_radius: u32,
    pub posterize_levels: u32,
    pub brightness: f32,
    pub contrast: f32,
    pub gamma: f32,
    pub edge_boost: f32,
    pub dither_algorithm: DitherAlgorithm,
    pub dither_strength: f32,
    pub serpentine: bool,
    pub inverse: bool,
    pub color_mode: ColorMode,
    pub mono_foreground: Rgb,
    pub background: Rgb,
    pub palette_id: String,
    pub char_ramp_id: String,
    pub crt_overlay: bool,
}

impl Default for RenderSettings {
    fn default() -> Self {
        Self {
            mode: RenderMode::Ascii,
            auto_fit: true,
            native_one_to_one: false,
            columns: 112,
            cell_aspect_ratio: 0.52,
            blur_radius: 0,
            posterize_levels: 0,
            brightness: 0.0,
            contrast: 10.0,
            gamma: 1.0,
            edge_boost: 15.0,
            dither_algorithm: DitherAlgorithm::Bayer8,
            dither_strength: 65.0,
            serpentine: true,
            inverse: false,
            color_mode: ColorMode::Mono,
            mono_foreground: Rgb::new(0x33, 0xFF, 0x66),
            background: Rgb::new(0x05, 0x08, 0x06),
            palette_id: "p31-phosphor".to_string(),
            char_ramp_id: "ascii-standard".to_string(),
            crt_overlay: true,
        }
    }
}

impl RenderSettings {
    pub fn with_columns(mut self, columns: u32) -> Self {
        self.columns = columns;
        self
    }

    pub fn column_range(&self) -> u32 {
        self.columns.clamp(16, 320)
    }
}

/// Auto-fit heuristic used when a new image is loaded (`computeAutoFitColumns`).
pub fn auto_fit_columns(img_width: u32, img_height: u32, is_mobile: bool) -> u32 {
    let max_default = if is_mobile { 84.0 } else { 136.0 };
    let min_default = if is_mobile { 48.0 } else { 64.0 };
    let ratio = img_width as f64 / (img_height.max(1) as f64);
    let suggested = (img_width as f64 / 6.0)
        .min(112.0 * (ratio.clamp(0.6, 1.8)).sqrt())
        .round();
    (suggested.clamp(min_default, max_default)).round() as u32
}
