//! `phosphorgrid` — render images to pixel/ASCII art from the terminal.
//!
//! Usage:
//!   phosphorgrid <image> [options]
//!
//! Run `phosphorgrid --help` for the full option list.

use std::path::{Path, PathBuf};
use std::process::ExitCode;

use phosphorgrid_core::{
    char_ramp_by_id, compute_local_auto_tune, palette_by_id, render_blocks_rgba,
    render_with_settings, to_ansi, to_plain_text, to_svg, AnsiColorDepth, ColorMode,
    DitherAlgorithm, RenderMode, RenderSettings,
};

const HELP: &str = "\
PhosphorGrid native renderer

USAGE:
    phosphorgrid <image> [options]

OPTIONS:
    -f, --format <txt|ansi|svg|png>   Output format (default: txt, or from --out)
    -o, --out <path>                  Write to a file instead of stdout
        --mode <pixel|ascii|halfblock|braille>
        --columns <16-320>            Character/pixel columns
        --dither <none|bayer2|bayer4|bayer8|bayer16|stochastic|floyd-steinberg|atkinson|stucki>
        --strength <0-100>            Dither strength (default 65)
        --color <mono|grayscale|palette|truecolor>
        --palette <id>                See --list
        --ramp <id>                   See --list
        --fg <#RRGGBB>                Mono foreground
        --bg <#RRGGBB>                Background
        --contrast <-80..80>          Tone contrast
        --brightness <-80..80>
        --gamma <0.3-2.6>
        --blur <0-6>                  Spatial smoothing radius
        --posterize <0-32>            Tone levels (0 = off)
        --edge <0-100>                Edge boost
        --inverse                     Flip light and dark
        --crt                         Bake scanlines into PNG output
        --scale <1-8>                 PNG pixel scale (default 2)
        --ansi-depth <16|256|truecolor>
        --goal <text>                 Offline auto-tune for a plain-English look
        --list                        List built-in palettes and ramps
    -h, --help
    -V, --version

Character modes (ascii/braille) export as TXT, ANSI or SVG; PNG export covers
pixel and half-block modes because the native build carries no bitmap font.
";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Format {
    Txt,
    Ansi,
    Svg,
    Png,
}

impl Format {
    fn from_id(id: &str) -> Option<Self> {
        match id {
            "txt" | "text" => Some(Format::Txt),
            "ansi" | "ans" => Some(Format::Ansi),
            "svg" => Some(Format::Svg),
            "png" => Some(Format::Png),
            _ => None,
        }
    }

    fn extension(self) -> &'static str {
        match self {
            Format::Txt => "txt",
            Format::Ansi => "ans",
            Format::Svg => "svg",
            Format::Png => "png",
        }
    }
}

struct Options {
    input: PathBuf,
    output: Option<PathBuf>,
    format: Option<Format>,
    settings: RenderSettings,
    ansi_depth: AnsiColorDepth,
    png_scale: usize,
    goal: Option<String>,
}

fn usage_error(message: &str) -> ExitCode {
    eprintln!("phosphorgrid: {message}\n\nTry `phosphorgrid --help`.");
    ExitCode::from(2)
}

fn parse_number<T: std::str::FromStr>(value: &str, flag: &str) -> Result<T, ExitCode> {
    value
        .parse::<T>()
        .map_err(|_| usage_error(&format!("invalid value for {flag}: {value}")))
}

fn parse_args() -> Result<Option<Options>, ExitCode> {
    let mut args = std::env::args().skip(1).peekable();
    let mut input: Option<PathBuf> = None;
    let mut output: Option<PathBuf> = None;
    let mut format: Option<Format> = None;
    let mut settings = RenderSettings {
        auto_fit: false,
        native_one_to_one: false,
        columns: 100,
        ..Default::default()
    };
    let mut ansi_depth = AnsiColorDepth::TrueColor;
    let mut png_scale = 2usize;
    let mut goal: Option<String> = None;

    while let Some(arg) = args.next() {
        match arg.as_str() {
            "-h" | "--help" => {
                print!("{HELP}");
                return Ok(None);
            }
            "-V" | "--version" => {
                println!("phosphorgrid {}", env!("CARGO_PKG_VERSION"));
                return Ok(None);
            }
            "--list" => {
                println!("Palettes:");
                for (id, name, colors) in phosphorgrid_core::PALETTES {
                    println!("  {id:<16} {name} ({} colors)", colors.len());
                }
                println!("\nCharacter ramps:");
                for (id, name, chars) in phosphorgrid_core::CHAR_RAMPS {
                    println!("  {id:<16} {name} ({} glyphs)", chars.chars().count());
                }
                return Ok(None);
            }
            "-o" | "--out" => {
                let value = args
                    .next()
                    .ok_or_else(|| usage_error("--out needs a path"))?;
                output = Some(PathBuf::from(value));
            }
            "-f" | "--format" => {
                let value = args
                    .next()
                    .ok_or_else(|| usage_error("--format needs a value"))?;
                format = Some(
                    Format::from_id(&value)
                        .ok_or_else(|| usage_error(&format!("unknown format: {value}")))?,
                );
            }
            "--mode" => {
                let value = args
                    .next()
                    .ok_or_else(|| usage_error("--mode needs a value"))?;
                settings.mode = RenderMode::from_id(&value)
                    .ok_or_else(|| usage_error(&format!("unknown mode: {value}")))?;
                settings.cell_aspect_ratio = match settings.mode {
                    RenderMode::Pixel => 1.0,
                    RenderMode::HalfBlock | RenderMode::Braille => 0.5,
                    RenderMode::Ascii => 0.52,
                };
            }
            "--columns" => {
                let raw = args
                    .next()
                    .ok_or_else(|| usage_error("--columns needs a value"))?;
                settings.columns = parse_number::<u32>(&raw, "--columns")?.clamp(16, 320);
            }
            "--dither" => {
                let raw = args
                    .next()
                    .ok_or_else(|| usage_error("--dither needs a value"))?;
                settings.dither_algorithm = DitherAlgorithm::from_id(&raw)
                    .ok_or_else(|| usage_error(&format!("unknown dither: {raw}")))?;
            }
            "--strength" => {
                let raw = args
                    .next()
                    .ok_or_else(|| usage_error("--strength needs a value"))?;
                settings.dither_strength =
                    parse_number::<f32>(&raw, "--strength")?.clamp(0.0, 100.0);
            }
            "--color" => {
                let raw = args
                    .next()
                    .ok_or_else(|| usage_error("--color needs a value"))?;
                settings.color_mode = ColorMode::from_id(&raw)
                    .ok_or_else(|| usage_error(&format!("unknown color mode: {raw}")))?;
            }
            "--palette" => {
                let raw = args
                    .next()
                    .ok_or_else(|| usage_error("--palette needs a value"))?;
                let palette = palette_by_id(&raw);
                if palette.id != raw {
                    eprintln!("warning: unknown palette '{raw}', using {}", palette.id);
                }
                settings.palette_id = palette.id.to_string();
            }
            "--ramp" => {
                let raw = args
                    .next()
                    .ok_or_else(|| usage_error("--ramp needs a value"))?;
                let ramp = char_ramp_by_id(&raw);
                if ramp.id != raw {
                    eprintln!("warning: unknown ramp '{raw}', using {}", ramp.id);
                }
                settings.char_ramp_id = ramp.id.to_string();
            }
            "--fg" => {
                let raw = args
                    .next()
                    .ok_or_else(|| usage_error("--fg needs a value"))?;
                settings.mono_foreground = phosphorgrid_core::Rgb::from_hex(&raw);
            }
            "--bg" => {
                let raw = args
                    .next()
                    .ok_or_else(|| usage_error("--bg needs a value"))?;
                settings.background = phosphorgrid_core::Rgb::from_hex(&raw);
            }
            "--contrast" => {
                let raw = args
                    .next()
                    .ok_or_else(|| usage_error("--contrast needs a value"))?;
                settings.contrast = parse_number::<f32>(&raw, "--contrast")?.clamp(-80.0, 80.0);
            }
            "--brightness" => {
                let raw = args
                    .next()
                    .ok_or_else(|| usage_error("--brightness needs a value"))?;
                settings.brightness = parse_number::<f32>(&raw, "--brightness")?.clamp(-80.0, 80.0);
            }
            "--gamma" => {
                let raw = args
                    .next()
                    .ok_or_else(|| usage_error("--gamma needs a value"))?;
                settings.gamma = parse_number::<f32>(&raw, "--gamma")?.clamp(0.3, 2.6);
            }
            "--blur" => {
                let raw = args
                    .next()
                    .ok_or_else(|| usage_error("--blur needs a value"))?;
                settings.blur_radius = parse_number::<u32>(&raw, "--blur")?.min(6);
            }
            "--posterize" => {
                let raw = args
                    .next()
                    .ok_or_else(|| usage_error("--posterize needs a value"))?;
                settings.posterize_levels = parse_number::<u32>(&raw, "--posterize")?.min(32);
            }
            "--edge" => {
                let raw = args
                    .next()
                    .ok_or_else(|| usage_error("--edge needs a value"))?;
                settings.edge_boost = parse_number::<f32>(&raw, "--edge")?.clamp(0.0, 100.0);
            }
            "--inverse" => settings.inverse = true,
            "--crt" => settings.crt_overlay = true,
            "--scale" => {
                let raw = args
                    .next()
                    .ok_or_else(|| usage_error("--scale needs a value"))?;
                png_scale = parse_number::<usize>(&raw, "--scale")?.clamp(1, 8);
            }
            "--ansi-depth" => {
                let raw = args
                    .next()
                    .ok_or_else(|| usage_error("--ansi-depth needs a value"))?;
                ansi_depth = AnsiColorDepth::from_id(&raw)
                    .ok_or_else(|| usage_error(&format!("unknown ANSI depth: {raw}")))?;
            }
            "--goal" => {
                let raw = args
                    .next()
                    .ok_or_else(|| usage_error("--goal needs text"))?;
                goal = Some(raw);
            }
            other if other.starts_with('-') && other != "-" => {
                return Err(usage_error(&format!("unknown option: {other}")));
            }
            other => {
                if input.is_some() {
                    return Err(usage_error("only one input image is supported"));
                }
                input = Some(PathBuf::from(other));
            }
        }
    }

    let input = input.ok_or_else(|| usage_error("missing input image"))?;

    Ok(Some(Options {
        input,
        output,
        format,
        settings,
        ansi_depth,
        png_scale,
        goal,
    }))
}

fn format_from_path(path: &Path, fallback: Format) -> Format {
    path.extension()
        .and_then(|extension| extension.to_str())
        .and_then(Format::from_id)
        .unwrap_or(fallback)
}

fn default_output_path(input: &Path, format: Format) -> PathBuf {
    let stem = input
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("phosphorgrid");
    PathBuf::from(format!("{stem}-phosphorgrid.{}", format.extension()))
}

fn execute(options: Options) -> Result<(), String> {
    let image = image::open(&options.input)
        .map_err(|error| format!("cannot decode {}: {error}", options.input.display()))?;
    let rgba = image.to_rgba8();
    let (width, height) = rgba.dimensions();
    let pixels = rgba.into_raw();

    let mut settings = options.settings.clone();
    if let Some(goal) = options.goal.as_deref() {
        let recommendation = compute_local_auto_tune(&pixels, width, height, &settings, Some(goal));
        settings = recommendation.settings;
    }

    let format = options.format.unwrap_or_else(|| match &options.output {
        Some(path) => format_from_path(path, Format::Txt),
        None => Format::Txt,
    });

    let result = render_with_settings(&pixels, width, height, &settings);

    let payload: Vec<u8> = match format {
        Format::Txt => to_plain_text(&result).into_bytes(),
        Format::Ansi => to_ansi(&result, options.ansi_depth).into_bytes(),
        Format::Svg => to_svg(&result, settings.cell_aspect_ratio).into_bytes(),
        Format::Png => {
            let raster = render_blocks_rgba(
                &result,
                settings.cell_aspect_ratio,
                options.png_scale,
                settings.crt_overlay,
            )
            .ok_or_else(|| {
                "PNG export covers pixel and half-block modes; use --format svg for character art"
                    .to_string()
            })?;
            let buffer =
                image::RgbaImage::from_raw(raster.width as u32, raster.height as u32, raster.rgba)
                    .ok_or_else(|| "failed to assemble PNG buffer".to_string())?;
            let mut png: Vec<u8> = Vec::new();
            image::DynamicImage::ImageRgba8(buffer)
                .write_to(&mut std::io::Cursor::new(&mut png), image::ImageFormat::Png)
                .map_err(|error| format!("failed to encode PNG: {error}"))?;
            png
        }
    };

    match options.output {
        Some(path) => {
            if let Some(parent) = path.parent() {
                if !parent.as_os_str().is_empty() {
                    std::fs::create_dir_all(parent)
                        .map_err(|error| format!("cannot create {}: {error}", parent.display()))?;
                }
            }
            std::fs::write(&path, &payload)
                .map_err(|error| format!("cannot write {}: {error}", path.display()))?;
            eprintln!(
                "wrote {} ({}×{} cells, {:.1} ms, {} bytes)",
                path.display(),
                result.cols,
                result.rows,
                result.render_time_ms,
                payload.len()
            );
        }
        None => {
            if format == Format::Png {
                let path = default_output_path(&options.input, format);
                std::fs::write(&path, &payload)
                    .map_err(|error| format!("cannot write {}: {error}", path.display()))?;
                eprintln!("wrote {}", path.display());
            } else {
                use std::io::Write;
                let mut stdout = std::io::stdout().lock();
                stdout
                    .write_all(&payload)
                    .and_then(|_| stdout.write_all(b"\n"))
                    .map_err(|error| format!("cannot write to stdout: {error}"))?;
            }
        }
    }

    Ok(())
}

fn main() -> ExitCode {
    match parse_args() {
        Ok(None) => ExitCode::SUCCESS,
        Ok(Some(options)) => match execute(options) {
            Ok(()) => ExitCode::SUCCESS,
            Err(message) => {
                eprintln!("phosphorgrid: {message}");
                ExitCode::FAILURE
            }
        },
        Err(code) => code,
    }
}
