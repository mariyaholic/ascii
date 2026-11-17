use crate::settings::Rgb;

/// Color palette identified by the same ids the studio stores in presets.
#[derive(Clone, Debug, PartialEq)]
pub struct Palette {
    pub id: &'static str,
    pub name: &'static str,
    pub colors: Vec<Rgb>,
}

impl Palette {
    pub fn fallback() -> Self {
        Self {
            id: "p31-phosphor",
            name: "P31 Green Phosphor",
            colors: vec![
                Rgb::new(0x04, 0x08, 0x05),
                Rgb::new(0x0D, 0x33, 0x18),
                Rgb::new(0x1A, 0x7A, 0x36),
                Rgb::new(0x33, 0xFF, 0x66),
                Rgb::new(0xB8, 0xFF, 0xD0),
            ],
        }
    }
}

/// Ordered glyph ramp from sparse/dark to dense/bright.
#[derive(Clone, Debug, PartialEq)]
pub struct CharRamp {
    pub id: &'static str,
    pub name: &'static str,
    pub chars: Vec<char>,
}

impl CharRamp {
    pub fn fallback() -> Self {
        Self {
            id: "ascii-standard",
            name: "Standard ASCII (10)",
            chars: " .:-=+*#%@".chars().collect(),
        }
    }

    pub fn len(&self) -> usize {
        self.chars.len()
    }

    pub fn is_empty(&self) -> bool {
        self.chars.is_empty()
    }
}

pub const PALETTES: &[(&str, &str, &[&str])] = &[
    (
        "p31-phosphor",
        "P31 Green Phosphor",
        &["#040805", "#0D3318", "#1A7A36", "#33FF66", "#B8FFD0"],
    ),
    (
        "p3-amber",
        "P3 Amber Phosphor",
        &["#090602", "#3B2300", "#8F5600", "#FFB000", "#FFE399"],
    ),
    (
        "dmg-gameboy",
        "Game Boy DMG-01",
        &["#0F380F", "#306230", "#8BAC0F", "#9BBC0F"],
    ),
    ("mac-1bit", "Classic 1-Bit Ink", &["#070A08", "#EEF5F0"]),
    (
        "cga-mode4",
        "CGA Mode 4",
        &["#000000", "#55FFFF", "#FF55FF", "#FFFFFF"],
    ),
    (
        "c64-vic",
        "Commodore 64",
        &[
            "#000000", "#FFFFFF", "#880000", "#AAFFEE", "#CC44CC", "#00CC55", "#0000AA", "#EEEE77",
            "#DD8855", "#664400", "#FF7777", "#333333", "#777777", "#AAFF66", "#0088FF", "#BBBBBB",
        ],
    ),
    (
        "pico-8",
        "PICO-8 Fantasy",
        &[
            "#000000", "#1D2B53", "#7E2553", "#008751", "#AB5236", "#5F574F", "#C2C3C7", "#FFF1E8",
            "#FF004D", "#FFA300", "#FFEC27", "#00E436", "#29ADFF", "#83769C", "#FF77A8", "#FFCCAA",
        ],
    ),
    (
        "ansi-16",
        "ANSI 16 Standard",
        &[
            "#000000", "#800000", "#008000", "#808000", "#000080", "#800080", "#008080", "#C0C0C0",
            "#808080", "#FF0000", "#00FF00", "#FFFF00", "#0000FF", "#FF00FF", "#00FFFF", "#FFFFFF",
        ],
    ),
];

pub const CHAR_RAMPS: &[(&str, &str, &str)] = &[
    ("ascii-standard", "Standard ASCII (10)", " .:-=+*#%@"),
    (
        "ascii-dense",
        "Dense ASCII (70)",
        " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
    ),
    (
        "unicode-blocks",
        "Unicode Shade Blocks",
        " \u{2591}\u{2592}\u{2593}\u{2588}",
    ),
    (
        "geometric-dots",
        "Geometric Dots",
        " \u{00B7}\u{25E6}\u{25CB}\u{25CE}\u{25CF}\u{25C9}\u{2588}",
    ),
    (
        "box-crosshatch",
        "Box & Crosshatch",
        " \u{00B7}-\u{253C}\u{256C}\u{2593}\u{2588}",
    ),
    ("binary-block", "Binary Solid", " \u{2588}"),
];

/// Resolve a palette id, falling back to P31 when the id is unknown.
pub fn palette_by_id(id: &str) -> Palette {
    PALETTES
        .iter()
        .find(|(pid, _, _)| *pid == id)
        .map(|(pid, name, colors)| Palette {
            id: pid,
            name,
            colors: colors.iter().map(|hex| Rgb::from_hex(hex)).collect(),
        })
        .unwrap_or_else(Palette::fallback)
}

/// Resolve a character ramp id, falling back to the standard ASCII ramp.
pub fn char_ramp_by_id(id: &str) -> CharRamp {
    CHAR_RAMPS
        .iter()
        .find(|(rid, _, _)| *rid == id)
        .map(|(rid, name, chars)| CharRamp {
            id: rid,
            name,
            chars: chars.chars().collect(),
        })
        .unwrap_or_else(CharRamp::fallback)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_palette_parses_to_colors() {
        for (id, _, colors) in PALETTES {
            let palette = palette_by_id(id);
            assert_eq!(palette.colors.len(), colors.len(), "palette {id}");
            assert_eq!(palette.id, *id);
            assert!(palette.colors.len() >= 2);
        }
    }

    #[test]
    fn unknown_palette_and_ramp_fall_back() {
        assert_eq!(palette_by_id("nope").id, "p31-phosphor");
        assert_eq!(char_ramp_by_id("nope").id, "ascii-standard");
    }

    #[test]
    fn every_ramp_starts_empty_and_has_at_least_two_steps() {
        for (id, _, chars) in CHAR_RAMPS {
            let ramp = char_ramp_by_id(id);
            assert!(ramp.len() >= 2, "ramp {id}");
            assert_eq!(ramp.chars.first(), Some(&' '), "ramp {id} starts sparse");
            assert_eq!(ramp.chars.len(), chars.chars().count(), "ramp {id} length");
        }
    }
}
