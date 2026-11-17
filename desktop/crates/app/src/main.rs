//! PhosphorGrid Desktop — a native egui shell over the shared core engine.
//!
//! Images are opened by dropping them on the window, typing a path, or passing
//! one on the command line. Character modes preview as a true text grid; block
//! modes preview as a nearest-neighbour texture.

use std::path::{Path, PathBuf};

use eframe::egui;
use phosphorgrid_core::{
    auto_fit_columns, char_ramp_by_id, compute_local_auto_tune, export, palette_by_id,
    render_blocks_rgba, render_with_settings, AnsiColorDepth, CharRamp, ColorMode, DitherAlgorithm,
    Notice, Palette, PreviewState, RenderMode, RenderResult, RenderSettings, Rgb, TuneSession,
    TuneSource,
};

fn main() -> eframe::Result<()> {
    let options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_inner_size([1280.0, 820.0])
            .with_min_inner_size([900.0, 580.0])
            .with_title("PhosphorGrid"),
        ..Default::default()
    };

    eframe::run_native(
        "PhosphorGrid",
        options,
        Box::new(|cc| Ok(Box::new(StudioApp::new(cc)))),
    )
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum TubeTheme {
    P31,
    P3,
    P4,
}

impl TubeTheme {
    const ALL: [TubeTheme; 3] = [TubeTheme::P31, TubeTheme::P3, TubeTheme::P4];

    fn label(self) -> &'static str {
        match self {
            TubeTheme::P31 => "P31 Green",
            TubeTheme::P3 => "P3 Amber",
            TubeTheme::P4 => "P4 Paper",
        }
    }

    fn background(self) -> egui::Color32 {
        match self {
            TubeTheme::P31 => egui::Color32::from_rgb(0x06, 0x09, 0x07),
            TubeTheme::P3 => egui::Color32::from_rgb(0x08, 0x07, 0x05),
            TubeTheme::P4 => egui::Color32::from_rgb(0x08, 0x09, 0x0B),
        }
    }

    fn well(self) -> egui::Color32 {
        match self {
            TubeTheme::P31 => egui::Color32::from_rgb(0x03, 0x05, 0x04),
            TubeTheme::P3 => egui::Color32::from_rgb(0x04, 0x03, 0x02),
            TubeTheme::P4 => egui::Color32::from_rgb(0x04, 0x05, 0x06),
        }
    }

    fn panel(self) -> egui::Color32 {
        match self {
            TubeTheme::P31 => egui::Color32::from_rgb(0x0C, 0x12, 0x0E),
            TubeTheme::P3 => egui::Color32::from_rgb(0x12, 0x0F, 0x0A),
            TubeTheme::P4 => egui::Color32::from_rgb(0x10, 0x13, 0x17),
        }
    }

    fn text(self) -> egui::Color32 {
        match self {
            TubeTheme::P31 => egui::Color32::from_rgb(0xD9, 0xF2, 0xE1),
            TubeTheme::P3 => egui::Color32::from_rgb(0xF5, 0xE6, 0xCC),
            TubeTheme::P4 => egui::Color32::from_rgb(0xE6, 0xED, 0xF3),
        }
    }

    fn muted(self) -> egui::Color32 {
        match self {
            TubeTheme::P31 => egui::Color32::from_rgb(0x7C, 0xA0, 0x88),
            TubeTheme::P3 => egui::Color32::from_rgb(0xA6, 0x8C, 0x64),
            TubeTheme::P4 => egui::Color32::from_rgb(0x8B, 0x98, 0xA8),
        }
    }

    fn accent(self) -> egui::Color32 {
        match self {
            TubeTheme::P31 => egui::Color32::from_rgb(0x33, 0xFF, 0x66),
            TubeTheme::P3 => egui::Color32::from_rgb(0xFF, 0xB0, 0x00),
            TubeTheme::P4 => egui::Color32::from_rgb(0xE6, 0xED, 0xF3),
        }
    }

    fn mono_foreground(self) -> Rgb {
        match self {
            TubeTheme::P31 => Rgb::new(0x33, 0xFF, 0x66),
            TubeTheme::P3 => Rgb::new(0xFF, 0xB0, 0x00),
            TubeTheme::P4 => Rgb::new(0xEE, 0xF5, 0xF0),
        }
    }

    fn apply(self, ctx: &egui::Context) {
        let mut visuals = egui::Visuals::dark();
        visuals.panel_fill = self.background();
        visuals.window_fill = self.panel();
        visuals.extreme_bg_color = self.well();
        visuals.override_text_color = Some(self.text());
        visuals.hyperlink_color = self.accent();
        visuals.selection.bg_fill = self.accent().gamma_multiply(0.35);
        visuals.selection.stroke = egui::Stroke::new(1.0_f32, self.accent());
        visuals.widgets.hovered.bg_stroke = egui::Stroke::new(1.0_f32, self.accent());
        visuals.widgets.active.bg_stroke = egui::Stroke::new(1.0_f32, self.accent());
        ctx.set_visuals(visuals);

        let mut style = (*ctx.style()).clone();
        style.spacing.item_spacing = egui::vec2(8.0, 8.0);
        style.spacing.slider_width = 170.0;
        ctx.set_style(style);
    }
}

struct SourceImage {
    name: String,
    width: u32,
    height: u32,
    rgba: Vec<u8>,
}

struct StudioApp {
    settings: RenderSettings,
    theme: TubeTheme,
    source: Option<SourceImage>,
    result: Option<RenderResult>,
    texture: Option<egui::TextureHandle>,
    text_lines: Vec<(String, egui::Color32)>,
    /// Replaces the old `dirty` flag: a preview can only go stale once a
    /// source exists.
    preview: PreviewState,
    /// Exactly one line in the status bar: either status or error.
    notice: Notice,
    /// Auto-tune session, shared with the browser studio's state machine.
    tune: TuneSession,
    tune_seq: u64,
    goal: String,
    path_input: String,
    output_dir: String,
}

impl StudioApp {
    fn new(cc: &eframe::CreationContext<'_>) -> Self {
        let theme = TubeTheme::P31;
        theme.apply(&cc.egui_ctx);

        let mut app = Self {
            settings: RenderSettings {
                auto_fit: false,
                native_one_to_one: false,
                columns: 100,
                ..Default::default()
            },
            theme,
            source: None,
            result: None,
            texture: None,
            text_lines: Vec::new(),
            preview: PreviewState::Empty,
            notice: Notice::Status(
                "Drop an image on the window, or type a path below.".to_string(),
            ),
            tune: TuneSession::Idle,
            tune_seq: 0,
            goal: String::new(),
            path_input: String::new(),
            output_dir: "phosphorgrid-out".to_string(),
        };

        if let Some(path) = std::env::args().nth(1) {
            app.path_input = path;
            app.load_path(&app.path_input.clone());
        }

        app
    }

    fn load_path(&mut self, path: &str) {
        let path = Path::new(path);
        match image::open(path) {
            Ok(image) => {
                let rgba = image.to_rgba8();
                let (width, height) = rgba.dimensions();
                self.settings.columns = auto_fit_columns(width, height, false);
                self.source = Some(SourceImage {
                    name: path
                        .file_name()
                        .and_then(|name| name.to_str())
                        .unwrap_or("image")
                        .to_string(),
                    width,
                    height,
                    rgba: rgba.into_raw(),
                });
                self.tune.cancel();
                self.preview.source_loaded();
                self.notice =
                    Notice::Status(format!("Loaded {} ({width}×{height})", path.display()));
            }
            Err(error) => {
                self.notice = Notice::Error(format!("Could not open {}: {error}", path.display()));
            }
        }
    }

    fn render(&mut self, ctx: &egui::Context) {
        let Some(source) = self.source.as_ref() else {
            return;
        };

        let result =
            render_with_settings(&source.rgba, source.width, source.height, &self.settings);
        self.text_lines.clear();

        match render_blocks_rgba(
            &result,
            self.settings.cell_aspect_ratio,
            2,
            self.settings.crt_overlay,
        ) {
            Some(raster) => {
                let image = egui::ColorImage::from_rgba_unmultiplied(
                    [raster.width, raster.height],
                    &raster.rgba,
                );
                self.texture =
                    Some(ctx.load_texture("preview", image, egui::TextureOptions::NEAREST));
            }
            None => {
                self.texture = None;
                let default_fg = color32(self.settings.mono_foreground);
                for y in 0..result.rows {
                    let mut line = String::with_capacity(result.cols);
                    let mut sums = [0u32; 3];
                    for x in 0..result.cols {
                        let index = y * result.cols + x;
                        line.push(char::from_u32(result.codepoints[index]).unwrap_or(' '));
                        let fg = result.fg(x, y);
                        sums[0] += fg[0] as u32;
                        sums[1] += fg[1] as u32;
                        sums[2] += fg[2] as u32;
                    }
                    let count = result.cols.max(1) as u32;
                    let color = if self.settings.color_mode == ColorMode::Mono {
                        default_fg
                    } else {
                        egui::Color32::from_rgb(
                            (sums[0] / count) as u8,
                            (sums[1] / count) as u8,
                            (sums[2] / count) as u8,
                        )
                    };
                    self.text_lines.push((line, color));
                }
            }
        }

        self.result = Some(result);
        self.preview.rendered();
        self.notice = Notice::Status(self.render_summary());
    }

    fn render_summary(&self) -> String {
        match &self.result {
            Some(result) => format!(
                "{}×{} cells · {:.1} ms · {} · {}",
                result.cols,
                result.rows,
                result.render_time_ms,
                result.mode.label(),
                self.settings.color_mode.label()
            ),
            None => "Drop an image on the window, or type a path below.".to_string(),
        }
    }

    fn auto_tune(&mut self) {
        let Some(source) = self.source.as_ref() else {
            self.notice = Notice::Error("Load an image before auto-tuning.".to_string());
            return;
        };
        self.tune_seq += 1;
        let request_id = self.tune_seq;
        self.tune.start(request_id, &self.settings);
        let goal = if self.goal.trim().is_empty() {
            None
        } else {
            Some(self.goal.trim())
        };
        let recommendation = compute_local_auto_tune(
            &source.rgba,
            source.width,
            source.height,
            &self.settings,
            goal,
        );
        // The native tuner is synchronous, so the request is always current;
        // going through the machine keeps undo semantics identical to the PWA.
        if !self.tune.resolve(
            request_id,
            recommendation.summary.clone(),
            TuneSource::Local,
            None,
        ) {
            return;
        }
        self.settings = recommendation.settings;
        self.theme = match self.settings.color_mode {
            ColorMode::Mono => match self.settings.palette_id.as_str() {
                "p3-amber" => TubeTheme::P3,
                "mac-1bit" => TubeTheme::P4,
                _ => self.theme,
            },
            _ => self.theme,
        };
        self.notice = Notice::Status(recommendation.summary);
        self.preview.invalidate();
    }

    fn undo_tune(&mut self) {
        if let Some(snapshot) = self.tune.undo() {
            self.settings = snapshot;
            self.notice =
                Notice::Status("Restored your settings from before auto-tune.".to_string());
            self.preview.invalidate();
        }
    }

    fn export(&mut self, format: &str) {
        let Some(result) = self.result.as_ref() else {
            self.notice = Notice::Error("Nothing rendered yet.".to_string());
            return;
        };
        let stem = self
            .source
            .as_ref()
            .map(|source| {
                source
                    .name
                    .rsplit_once('.')
                    .map(|(stem, _)| stem.to_string())
                    .unwrap_or_else(|| source.name.clone())
            })
            .unwrap_or_else(|| "phosphorgrid".to_string());

        let payload: Result<Vec<u8>, String> = match format {
            "txt" => Ok(export::to_plain_text(result).into_bytes()),
            "ansi" => Ok(export::to_ansi(result, AnsiColorDepth::TrueColor).into_bytes()),
            "svg" => Ok(export::to_svg(result, self.settings.cell_aspect_ratio).into_bytes()),
            "png" => render_blocks_rgba(
                result,
                self.settings.cell_aspect_ratio,
                2,
                self.settings.crt_overlay,
            )
            .ok_or_else(|| {
                "PNG export covers pixel and half-block modes; export SVG for character art."
                    .to_string()
            })
            .and_then(|raster| {
                let buffer = image::RgbaImage::from_raw(
                    raster.width as u32,
                    raster.height as u32,
                    raster.rgba,
                )
                .ok_or_else(|| "could not assemble PNG buffer".to_string())?;
                let mut png = Vec::new();
                image::DynamicImage::ImageRgba8(buffer)
                    .write_to(&mut std::io::Cursor::new(&mut png), image::ImageFormat::Png)
                    .map_err(|error| format!("PNG encode failed: {error}"))?;
                Ok(png)
            }),
            _ => Err(format!("unknown export format: {format}")),
        };

        match payload {
            Ok(bytes) => {
                let directory = PathBuf::from(&self.output_dir);
                if let Err(error) = std::fs::create_dir_all(&directory) {
                    self.notice =
                        Notice::Error(format!("Could not create {}: {error}", directory.display()));
                    return;
                }
                let path = directory.join(format!("{stem}.{format}"));
                match std::fs::write(&path, &bytes) {
                    Ok(()) => {
                        self.notice = Notice::Status(format!(
                            "Exported {} ({} bytes)",
                            path.display(),
                            bytes.len()
                        ));
                    }
                    Err(error) => {
                        self.notice =
                            Notice::Error(format!("Could not write {}: {error}", path.display()));
                    }
                }
            }
            Err(message) => self.notice = Notice::Error(message),
        }
    }

    fn handle_dropped_files(&mut self, ctx: &egui::Context) {
        let dropped: Vec<PathBuf> = ctx.input(|input| {
            input
                .raw
                .dropped_files
                .iter()
                .filter_map(|file| file.path.clone())
                .collect()
        });
        if let Some(path) = dropped.first() {
            let path = path.to_string_lossy().to_string();
            self.path_input = path.clone();
            self.load_path(&path);
        }
    }
}

fn color32(rgb: Rgb) -> egui::Color32 {
    egui::Color32::from_rgb(rgb.r, rgb.g, rgb.b)
}

fn rgb_array(rgb: Rgb) -> [u8; 3] {
    [rgb.r, rgb.g, rgb.b]
}

impl eframe::App for StudioApp {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        self.handle_dropped_files(ctx);
        self.theme.apply(ctx);

        if self.preview.needs_render() {
            self.render(ctx);
        }

        egui::TopBottomPanel::top("masthead")
            .frame(
                egui::Frame::default()
                    .fill(self.theme.panel())
                    .inner_margin(egui::Margin::symmetric(14, 10)),
            )
            .show(ctx, |ui| {
                ui.horizontal(|ui| {
                    ui.label(
                        egui::RichText::new("PhosphorGrid")
                            .size(19.0)
                            .strong()
                            .color(self.theme.text()),
                    );
                    ui.add_space(8.0);
                    ui.label(
                        egui::RichText::new("Native Studio")
                            .size(11.0)
                            .color(self.theme.muted()),
                    );
                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        for format in ["png", "svg", "ansi", "txt"] {
                            let enabled = self.result.is_some();
                            if ui
                                .add_enabled(
                                    enabled,
                                    egui::Button::new(
                                        egui::RichText::new(format.to_uppercase()).size(11.0),
                                    ),
                                )
                                .on_hover_text(format!("Export {}", format.to_uppercase()))
                                .clicked()
                            {
                                self.export(format);
                            }
                        }
                        ui.label(
                            egui::RichText::new("Export")
                                .size(11.0)
                                .color(self.theme.muted()),
                        );
                    });
                });
            });

        egui::SidePanel::left("controls")
            .exact_width(332.0)
            .resizable(false)
            .frame(
                egui::Frame::default()
                    .fill(self.theme.panel())
                    .inner_margin(egui::Margin::symmetric(14, 12)),
            )
            .show(ctx, |ui| {
                egui::ScrollArea::vertical().show(ui, |ui| {
                    self.controls(ui);
                });
            });

        egui::TopBottomPanel::bottom("status")
            .frame(
                egui::Frame::default()
                    .fill(self.theme.panel())
                    .inner_margin(egui::Margin::symmetric(14, 7)),
            )
            .show(ctx, |ui| {
                match &self.notice {
                    Notice::Error(error) => ui.label(
                        egui::RichText::new(error)
                            .size(11.0)
                            .color(self.theme.accent()),
                    ),
                    Notice::Status(status) => ui.label(
                        egui::RichText::new(status)
                            .monospace()
                            .size(11.0)
                            .color(self.theme.muted()),
                    ),
                };
            });

        egui::CentralPanel::default()
            .frame(egui::Frame::default().fill(self.theme.well()))
            .show(ctx, |ui| self.preview(ui));

        if ctx.input(|input| input.key_pressed(egui::Key::Escape)) {
            // Escape clears a lingering error without closing the window.
            if self.notice.is_error() {
                self.notice = Notice::Status(self.render_summary());
            }
        }
    }
}

impl StudioApp {
    fn controls(&mut self, ui: &mut egui::Ui) {
        ui.label(section_title("Source", self.theme));
        ui.horizontal(|ui| {
            ui.add(
                egui::TextEdit::singleline(&mut self.path_input)
                    .hint_text("/path/to/image.png")
                    .desired_width(190.0),
            );
            if ui.button("Load").clicked() {
                let path = self.path_input.clone();
                self.load_path(&path);
            }
        });
        ui.label(
            egui::RichText::new("PNG · JPG · WebP · GIF — or drop a file on the canvas")
                .size(10.0)
                .color(self.theme.muted()),
        );

        ui.separator();
        ui.label(section_title("Smart style assistant", self.theme));
        ui.horizontal(|ui| {
            ui.add(
                egui::TextEdit::singleline(&mut self.goal)
                    .hint_text("crisp ink sketch, game boy…")
                    .desired_width(190.0),
            );
            if ui.button("Tune").clicked() {
                self.auto_tune();
            }
        });
        ui.horizontal(|ui| {
            if ui.button("Auto-tune this image").clicked() {
                self.auto_tune();
            }
            if ui
                .add_enabled(self.tune.can_undo(), egui::Button::new("Undo tune"))
                .on_hover_text("Restore the settings from before auto-tune")
                .clicked()
            {
                self.undo_tune();
            }
        });

        ui.separator();
        ui.label(section_title("Render mode & grid", self.theme));
        let mut mode_changed = false;
        egui::ComboBox::from_label("Mode")
            .selected_text(self.settings.mode.label())
            .show_ui(ui, |ui| {
                for mode in RenderMode::ALL {
                    if ui
                        .selectable_value(&mut self.settings.mode, mode, mode.label())
                        .clicked()
                    {
                        mode_changed = true;
                    }
                }
            });
        if mode_changed {
            self.settings.cell_aspect_ratio = match self.settings.mode {
                RenderMode::Pixel => 1.0,
                RenderMode::HalfBlock | RenderMode::Braille => 0.5,
                RenderMode::Ascii => 0.52,
            };
            self.preview.invalidate();
        }

        if ui
            .add(egui::Slider::new(&mut self.settings.columns, 16..=320).text("Columns"))
            .changed()
        {
            self.preview.invalidate();
        }
        if self.settings.mode != RenderMode::Pixel
            && ui
                .add(
                    egui::Slider::new(&mut self.settings.cell_aspect_ratio, 0.35..=1.0)
                        .text("Cell aspect"),
                )
                .changed()
        {
            self.preview.invalidate();
        }

        ui.separator();
        ui.label(section_title("Tone & simplification", self.theme));
        if ui
            .add(egui::Slider::new(&mut self.settings.contrast, -80.0..=80.0).text("Contrast"))
            .changed()
        {
            self.preview.invalidate();
        }
        if ui
            .add(egui::Slider::new(&mut self.settings.brightness, -80.0..=80.0).text("Brightness"))
            .changed()
        {
            self.preview.invalidate();
        }
        if ui
            .add(egui::Slider::new(&mut self.settings.gamma, 0.3..=2.6).text("Gamma"))
            .changed()
        {
            self.preview.invalidate();
        }
        if ui
            .add(egui::Slider::new(&mut self.settings.blur_radius, 0..=6).text("Smoothing"))
            .changed()
        {
            self.preview.invalidate();
        }
        if ui
            .add(egui::Slider::new(&mut self.settings.posterize_levels, 0..=32).text("Posterize"))
            .changed()
        {
            self.preview.invalidate();
        }
        if ui
            .add(egui::Slider::new(&mut self.settings.edge_boost, 0.0..=100.0).text("Edge boost"))
            .changed()
        {
            self.preview.invalidate();
        }

        ui.separator();
        ui.label(section_title("Dithering", self.theme));
        egui::ComboBox::from_label("Algorithm")
            .selected_text(self.settings.dither_algorithm.label())
            .show_ui(ui, |ui| {
                for algorithm in DitherAlgorithm::ALL {
                    if ui
                        .selectable_value(
                            &mut self.settings.dither_algorithm,
                            algorithm,
                            algorithm.label(),
                        )
                        .clicked()
                    {
                        self.preview.invalidate();
                    }
                }
            });
        if ui
            .add(
                egui::Slider::new(&mut self.settings.dither_strength, 0.0..=100.0).text("Strength"),
            )
            .changed()
        {
            self.preview.invalidate();
        }
        if self.settings.dither_algorithm.is_error_diffusion()
            && ui
                .checkbox(&mut self.settings.serpentine, "Serpentine scan")
                .changed()
        {
            self.preview.invalidate();
        }

        ui.separator();
        ui.label(section_title("Color & glyphs", self.theme));
        egui::ComboBox::from_label("Color mode")
            .selected_text(self.settings.color_mode.label())
            .show_ui(ui, |ui| {
                for mode in ColorMode::ALL {
                    if ui
                        .selectable_value(&mut self.settings.color_mode, mode, mode.label())
                        .clicked()
                    {
                        self.preview.invalidate();
                    }
                }
            });

        if self.settings.color_mode == ColorMode::Palette {
            let palette = palette_by_id(&self.settings.palette_id);
            egui::ComboBox::from_label("Palette")
                .selected_text(palette.name)
                .show_ui(ui, |ui| {
                    for (id, name, colors) in phosphorgrid_core::PALETTES {
                        if ui
                            .selectable_label(self.settings.palette_id == *id, *name)
                            .on_hover_text(format!("{} colors", colors.len()))
                            .clicked()
                        {
                            self.settings.palette_id = (*id).to_string();
                            self.preview.invalidate();
                        }
                    }
                });
            self.swatch_strip(ui, &palette);
        }

        if self.settings.mode == RenderMode::Ascii {
            let ramp = char_ramp_by_id(&self.settings.char_ramp_id);
            egui::ComboBox::from_label("Character ramp")
                .selected_text(ramp.name)
                .show_ui(ui, |ui| {
                    for (id, name, chars) in phosphorgrid_core::CHAR_RAMPS {
                        if ui
                            .selectable_label(self.settings.char_ramp_id == *id, *name)
                            .on_hover_text(format!("{} glyphs", chars.chars().count()))
                            .clicked()
                        {
                            self.settings.char_ramp_id = (*id).to_string();
                            self.preview.invalidate();
                        }
                    }
                });
            self.ramp_preview(ui, &ramp);
        }

        if self.settings.color_mode == ColorMode::Mono {
            ui.horizontal(|ui| {
                let mut fg = rgb_array(self.settings.mono_foreground);
                if ui.color_edit_button_srgb(&mut fg).changed() {
                    self.settings.mono_foreground = Rgb::new(fg[0], fg[1], fg[2]);
                    self.preview.invalidate();
                }
                let mut bg = rgb_array(self.settings.background);
                if ui.color_edit_button_srgb(&mut bg).changed() {
                    self.settings.background = Rgb::new(bg[0], bg[1], bg[2]);
                    self.preview.invalidate();
                }
                ui.label(
                    egui::RichText::new("ink / paper")
                        .size(10.0)
                        .color(self.theme.muted()),
                );
            });
        }

        if ui
            .checkbox(&mut self.settings.inverse, "Invert light & dark")
            .changed()
        {
            self.preview.invalidate();
        }

        ui.separator();
        ui.label(section_title("Phosphor tube", self.theme));
        ui.horizontal(|ui| {
            for theme in TubeTheme::ALL {
                if ui
                    .selectable_label(self.theme == theme, theme.label())
                    .clicked()
                {
                    self.theme = theme;
                    if self.settings.color_mode == ColorMode::Mono {
                        self.settings.mono_foreground = theme.mono_foreground();
                        self.preview.invalidate();
                    }
                }
            }
        });

        ui.separator();
        ui.horizontal(|ui| {
            if ui.button("Reset look").clicked() {
                self.settings = RenderSettings {
                    auto_fit: false,
                    native_one_to_one: false,
                    columns: self.settings.columns,
                    ..Default::default()
                };
                self.theme = TubeTheme::P31;
                self.tune.cancel();
                self.preview.invalidate();
            }
            if ui
                .checkbox(&mut self.settings.crt_overlay, "CRT scanlines")
                .changed()
            {
                self.preview.invalidate();
            }
        });

        ui.horizontal(|ui| {
            ui.add(
                egui::TextEdit::singleline(&mut self.output_dir)
                    .hint_text("output folder")
                    .desired_width(180.0),
            );
            ui.label(
                egui::RichText::new("export dir")
                    .size(10.0)
                    .color(self.theme.muted()),
            );
        });
    }

    fn swatch_strip(&self, ui: &mut egui::Ui, palette: &Palette) {
        let (rect, _) =
            ui.allocate_exact_size(egui::vec2(ui.available_width(), 10.0), egui::Sense::hover());
        let painter = ui.painter();
        let count = palette.colors.len().max(1);
        let width = rect.width() / count as f32;
        for (index, color) in palette.colors.iter().enumerate() {
            let left = rect.left() + index as f32 * width;
            painter.rect_filled(
                egui::Rect::from_min_size(
                    egui::pos2(left, rect.top()),
                    egui::vec2(width, rect.height()),
                ),
                0.0,
                color32(*color),
            );
        }
    }

    fn ramp_preview(&self, ui: &mut egui::Ui, ramp: &CharRamp) {
        ui.label(
            egui::RichText::new(ramp.chars.iter().collect::<String>())
                .monospace()
                .size(12.0)
                .color(self.theme.accent()),
        );
    }

    fn preview(&mut self, ui: &mut egui::Ui) {
        if let Some(texture) = self.texture.clone() {
            let available = ui.available_size();
            let texture_size = texture.size_vec2();
            let scale = (available.x / texture_size.x)
                .min(available.y / texture_size.y)
                .clamp(0.05, 3.0);
            let size = texture_size * scale;

            egui::ScrollArea::both()
                .auto_shrink([false, false])
                .show(ui, |ui| {
                    ui.centered_and_justified(|ui| {
                        ui.image((texture.id(), size));
                    });
                });
            return;
        }

        if self.text_lines.is_empty() {
            ui.centered_and_justified(|ui| {
                ui.vertical_centered(|ui| {
                    ui.label(
                        egui::RichText::new("Drop an image here")
                            .size(18.0)
                            .color(self.theme.text()),
                    );
                    ui.label(
                        egui::RichText::new("or type a path in the Source panel")
                            .size(11.0)
                            .color(self.theme.muted()),
                    );
                });
            });
            return;
        }

        egui::ScrollArea::both()
            .auto_shrink([false, false])
            .show(ui, |ui| {
                ui.spacing_mut().item_spacing.y = 0.0;
                for (line, color) in &self.text_lines {
                    ui.add(
                        egui::Label::new(
                            egui::RichText::new(line)
                                .monospace()
                                .size(11.0)
                                .color(*color),
                        )
                        .wrap_mode(egui::TextWrapMode::Extend),
                    );
                }
            });
    }
}

fn section_title(text: &str, theme: TubeTheme) -> egui::RichText {
    egui::RichText::new(text.to_uppercase())
        .size(10.0)
        .strong()
        .color(theme.muted())
}
