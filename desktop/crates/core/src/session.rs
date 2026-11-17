//! Studio session state machines shared by the native shells.
//!
//! These mirror `src/state/tuneSession.ts` in the browser studio and are
//! exercised by the same transition table (see `docs/STATE_MACHINES.md`).
//! They are deliberately UI-free so the egui app, the CLI and tests drive the
//! exact same transitions.

use crate::settings::RenderSettings;

/// Where an auto-tune recommendation came from.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TuneSource {
    /// Hosted style model (browser only today).
    Api,
    /// Offline histogram/edge analysis.
    Local,
}

/// Auto-tune session.
///
/// ```text
///            start(id)               resolve(id)
///   Idle ─────────────▶ Tuning ─────────────────▶ Tuned
///    ▲  ◀── cancel ───── │  ◀────── start(id') ───── │
///    └──── cancel / undo ┴───────────────────────────┘
/// ```
///
/// * Only the request currently `Tuning` may resolve; stale answers are dropped.
/// * `snapshot` is the look before the first tune of the session, so undo
///   always returns to the user's own settings.
#[derive(Clone, Debug, PartialEq, Default)]
pub enum TuneSession {
    #[default]
    Idle,
    Tuning {
        request_id: u64,
        snapshot: RenderSettings,
    },
    Tuned {
        snapshot: RenderSettings,
        summary: String,
        source: TuneSource,
        notice: Option<String>,
    },
}

impl TuneSession {
    fn snapshot(&self) -> Option<&RenderSettings> {
        match self {
            TuneSession::Idle => None,
            TuneSession::Tuning { snapshot, .. } | TuneSession::Tuned { snapshot, .. } => {
                Some(snapshot)
            }
        }
    }

    /// Begin (or restart) a tune. `current` is only captured when the session
    /// was idle.
    pub fn start(&mut self, request_id: u64, current: &RenderSettings) {
        let snapshot = self.snapshot().cloned().unwrap_or_else(|| current.clone());
        *self = TuneSession::Tuning {
            request_id,
            snapshot,
        };
    }

    /// Accept the answer for `request_id`. Returns `false` (and leaves the
    /// session untouched) when that request is no longer the pending one, in
    /// which case the caller must not apply its settings either.
    pub fn resolve(
        &mut self,
        request_id: u64,
        summary: impl Into<String>,
        source: TuneSource,
        notice: Option<String>,
    ) -> bool {
        if !self.is_pending(request_id) {
            return false;
        }
        let TuneSession::Tuning { snapshot, .. } = std::mem::take(self) else {
            unreachable!("is_pending guarantees Tuning");
        };
        *self = TuneSession::Tuned {
            snapshot,
            summary: summary.into(),
            source,
            notice,
        };
        true
    }

    /// A new image, preset or reset makes any pending or applied tune moot.
    pub fn cancel(&mut self) {
        *self = TuneSession::Idle;
    }

    /// End a finished session, handing back the settings to restore.
    pub fn undo(&mut self) -> Option<RenderSettings> {
        match std::mem::take(self) {
            TuneSession::Tuned { snapshot, .. } => Some(snapshot),
            other => {
                *self = other;
                None
            }
        }
    }

    pub fn is_pending(&self, request_id: u64) -> bool {
        matches!(self, TuneSession::Tuning { request_id: id, .. } if *id == request_id)
    }

    pub fn is_tuning(&self) -> bool {
        matches!(self, TuneSession::Tuning { .. })
    }

    pub fn can_undo(&self) -> bool {
        matches!(self, TuneSession::Tuned { .. })
    }
}

/// Whether the on-screen preview reflects the current source and settings.
/// Replaces a free-floating `dirty: bool` that could be set with no source.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub enum PreviewState {
    /// No image loaded; nothing to render.
    #[default]
    Empty,
    /// Source or settings changed since the last render.
    Stale,
    /// The last render matches the current inputs.
    Fresh,
}

impl PreviewState {
    /// Settings changed. Without a source there is still nothing to render.
    pub fn invalidate(&mut self) {
        if *self != PreviewState::Empty {
            *self = PreviewState::Stale;
        }
    }

    /// A new source arrived.
    pub fn source_loaded(&mut self) {
        *self = PreviewState::Stale;
    }

    pub fn rendered(&mut self) {
        if *self == PreviewState::Stale {
            *self = PreviewState::Fresh;
        }
    }

    pub fn needs_render(self) -> bool {
        self == PreviewState::Stale
    }
}

/// The single line in the status bar. An error and a status message can no
/// longer both be "current".
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Notice {
    Status(String),
    Error(String),
}

impl Notice {
    pub fn is_error(&self) -> bool {
        matches!(self, Notice::Error(_))
    }

    pub fn text(&self) -> &str {
        match self {
            Notice::Status(text) | Notice::Error(text) => text,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mine() -> RenderSettings {
        RenderSettings {
            contrast: 33.0,
            ..Default::default()
        }
    }

    #[test]
    fn resolve_moves_to_tuned_and_keeps_snapshot() {
        let mut s = TuneSession::default();
        s.start(1, &mine());
        assert!(s.is_tuning());
        assert!(s.resolve(1, "ok", TuneSource::Local, None));
        assert_eq!(
            s,
            TuneSession::Tuned {
                snapshot: mine(),
                summary: "ok".into(),
                source: TuneSource::Local,
                notice: None
            }
        );
    }

    #[test]
    fn superseded_request_is_dropped() {
        let mut s = TuneSession::default();
        s.start(1, &mine());
        s.start(2, &mine());
        let before = s.clone();
        assert!(!s.resolve(1, "old", TuneSource::Api, None));
        assert_eq!(s, before);
        assert!(s.is_pending(2));
    }

    #[test]
    fn cancel_drops_in_flight_answer() {
        let mut s = TuneSession::default();
        s.start(7, &mine());
        s.cancel();
        assert!(!s.resolve(7, "stale", TuneSource::Api, None));
        assert_eq!(s, TuneSession::Idle);
    }

    #[test]
    fn retune_keeps_pre_session_snapshot() {
        let mut s = TuneSession::default();
        s.start(1, &mine());
        s.resolve(1, "a", TuneSource::Local, None);
        let tuned_once = RenderSettings {
            contrast: 60.0,
            ..Default::default()
        };
        s.start(2, &tuned_once);
        s.resolve(2, "b", TuneSource::Local, None);
        assert_eq!(s.undo(), Some(mine()));
        assert_eq!(s, TuneSession::Idle);
    }

    #[test]
    fn undo_only_from_tuned() {
        let mut s = TuneSession::default();
        assert_eq!(s.undo(), None);
        s.start(1, &mine());
        assert_eq!(s.undo(), None);
        assert!(s.is_tuning());
    }

    #[test]
    fn preview_cannot_go_stale_without_a_source() {
        let mut p = PreviewState::default();
        p.invalidate();
        assert!(!p.needs_render());
        p.source_loaded();
        assert!(p.needs_render());
        p.rendered();
        assert_eq!(p, PreviewState::Fresh);
        p.invalidate();
        assert!(p.needs_render());
    }
}
