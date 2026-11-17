//! PhosphorGrid core: a dependency-free port of the browser render engine.
//!
//! The studio's TypeScript engine (`src/engine/`) is the reference
//! implementation; this crate mirrors its arithmetic so the desktop build and
//! the PWA produce the same artwork from the same preset.

pub mod dither;
pub mod export;
pub mod library;
pub mod render;
pub mod settings;
pub mod tuner;

pub use export::{render_blocks_rgba, to_ansi, to_plain_text, to_svg, AnsiColorDepth, RasterImage};
pub use library::{char_ramp_by_id, palette_by_id, CharRamp, Palette, CHAR_RAMPS, PALETTES};
pub use render::{
    compute_target_dimensions, process_image, RenderResult, TargetDimensions, BLOCK_GLYPH,
    HALF_BLOCK_GLYPH,
};
pub use settings::{auto_fit_columns, ColorMode, DitherAlgorithm, RenderMode, RenderSettings, Rgb};
pub use tuner::{analyze_image, compute_local_auto_tune, ImageStats, StyleRecommendation};

/// Convenience: render with the built-in palette/ramp referenced by `settings`.
pub fn render_with_settings(
    rgba: &[u8],
    width: u32,
    height: u32,
    settings: &RenderSettings,
) -> RenderResult {
    let palette = palette_by_id(&settings.palette_id);
    let ramp = char_ramp_by_id(&settings.char_ramp_id);
    process_image(rgba, width, height, settings, &palette, &ramp)
}
