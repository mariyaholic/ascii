import type { RenderSettings } from '../types/studio';

/**
 * Auto-tune session state machine.
 *
 *            START(id)                 RESOLVE(id)
 *   idle ─────────────▶ tuning ─────────────────────▶ tuned
 *    ▲  ◀── CANCEL ───── │  ◀──────── START(id') ────── │
 *    │                   │                              │
 *    └──── CANCEL / UNDO ┴──────────────────────────────┘
 *
 * - Only the request that is currently `tuning` may resolve; a late answer for
 *   an older request (or one that was cancelled by a new image, a preset or a
 *   reset) is dropped instead of overwriting newer settings.
 * - `snapshot` is the look before the *first* tune of the session, so tuning
 *   twice and then undoing returns to the user's own settings, not to the
 *   first tune's output.
 *
 * Mirrored by `phosphorgrid_core::session::TuneSession` in the Rust port; both
 * are tested against the same transition table (docs/STATE_MACHINES.md).
 */
export type TuneSource = 'api' | 'local';

export type TuneSession =
  | { phase: 'idle' }
  | { phase: 'tuning'; requestId: number; snapshot: RenderSettings }
  | {
      phase: 'tuned';
      snapshot: RenderSettings;
      summary: string;
      source: TuneSource;
      notice: string | null;
    };

export type TuneEvent =
  | { type: 'START'; requestId: number; current: RenderSettings }
  | {
      type: 'RESOLVE';
      requestId: number;
      summary: string;
      source: TuneSource;
      notice?: string | null;
    }
  /** A new image, preset or reset makes any pending or applied tune moot. */
  | { type: 'CANCEL' }
  /** Restores `snapshot` (the caller applies it) and ends the session. */
  | { type: 'UNDO' };

export const IDLE_TUNE: TuneSession = { phase: 'idle' };

export function tuneReducer(state: TuneSession, event: TuneEvent): TuneSession {
  switch (event.type) {
    case 'START': {
      const snapshot = state.phase === 'idle' ? event.current : state.snapshot;
      return { phase: 'tuning', requestId: event.requestId, snapshot };
    }
    case 'RESOLVE':
      if (state.phase !== 'tuning' || state.requestId !== event.requestId) return state;
      return {
        phase: 'tuned',
        snapshot: state.snapshot,
        summary: event.summary,
        source: event.source,
        notice: event.notice ?? null,
      };
    case 'CANCEL':
      return state.phase === 'idle' ? state : IDLE_TUNE;
    case 'UNDO':
      return state.phase === 'tuned' ? IDLE_TUNE : state;
  }
}

/** True when a RESOLVE for `requestId` would be accepted. */
export function isPendingRequest(state: TuneSession, requestId: number): boolean {
  return state.phase === 'tuning' && state.requestId === requestId;
}
