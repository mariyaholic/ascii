# Studio state machines

An audit of where PhosphorGrid kept state as loose flags that only made sense
in some combinations, what was formalized, and what was left as-is (and why).

## Formalized

### Auto-tune session — `src/state/tuneSession.ts` ⇄ `desktop/crates/core/src/session.rs`

Previously five independent fields in `App.tsx` (`isAutoTuning`,
`tuneSummary`, `tuneSource`, `tuneError`, `undoSnapshot`). Now one tagged
union, implemented identically in TypeScript and Rust:

```
           START(id)                RESOLVE(id)
  idle ─────────────▶ tuning ─────────────────────▶ tuned
   ▲  ◀── CANCEL ───── │  ◀──────── START(id') ────── │
   └──── CANCEL / UNDO ┴──────────────────────────────┘
```

| From     | Event               | To       | Notes |
| -------- | ------------------- | -------- | ----- |
| idle     | START(id, current)  | tuning   | snapshot = current |
| tuning   | START(id')          | tuning   | snapshot kept, id replaced |
| tuned    | START(id')          | tuning   | snapshot kept (undo returns to the user's look) |
| tuning   | RESOLVE(id)         | tuned    | only if id is the pending one |
| tuning   | RESOLVE(stale id)   | tuning   | dropped, settings untouched |
| *        | CANCEL              | idle     | new image, preset, reset |
| tuned    | UNDO                | idle     | caller restores snapshot |
| idle/tuning | UNDO             | unchanged | |

**Bugs this closed**

1. *Stale tune over a new image.* Loading another image, applying a preset or
   resetting cleared the summary but not the in-flight request, so a slow
   style-model answer for image A was applied to image B and the spinner
   could stay on. CANCEL now bumps the request gate, so the late answer is
   ignored.
2. *Spinner could stick* if the local fallback itself threw; the session now
   always ends.
3. *Undo after two tunes* restored the first tune's output instead of the
   user's own settings.

Tests: `src/state/tuneSession.test.ts` (`npm test`) and
`session::tests` (`cargo test -p phosphorgrid-core`) cover the same table.

### Source loading — `App.tsx` (`loadRequestRef`)

`loadImageSource` had no request token. Decoding is async, so picking a large
file and then a sample could let the slower decode win. Each load now takes a
token; a superseded `onload`/`onerror` is discarded and its object URL revoked.

### Native preview and status — `PreviewState`, `Notice` (Rust)

The egui shell used `dirty: bool`, `status: String` and `error: Option<String>`.

- `PreviewState { Empty, Stale, Fresh }`: a preview cannot go stale before a
  source exists.
- `Notice { Status, Error }`: the status bar shows exactly one line; Escape
  on an error returns to the render summary.

The desktop app also gained **Undo tune**, which it was missing compared with
the PWA.

### Already explicit (verified, unchanged)

- **Overlay** (`StudioOverlay` in `App.tsx`): one union for every dialog,
  synced to `?panel=`; export refuses to open without a render.
- **Mobile sheet × control mode**: Guided mode has no dither/color sheets; an
  effect redirects to `mode`. The notice rail is now hidden on mobile while a
  sheet is open, because both occupy the same strip.

## Reviewed, left as flags

| Location | Flags | Why not formalized now |
| -------- | ----- | ---------------------- |
| `BatchModal` | `isRunning`, `zipBlob`, `batchError`, per-item `status` | Every transition sits in one async function with `finally`; no reachable bad combination was found. A `phase` union would be a readability win, not a fix. |
| `CRTCanvasViewport` | `isDraggingCanvas`, `isDraggingSplit`, `peekingOriginal`, `compareMode` | Pointer gestures; mutually exclusive in practice because each starts from a different element. |
| `usePWAInstall` | `hasPrompt`, `isInstalled`, `isSnoozed`, `isIOS` | The exposed values are already derived (`isInstallable`, `isIOS`). |
| `useServiceWorkerUpdate` | `needsRefresh`, `isOfflineReady` | Module-level, and the toast gives `needsRefresh` priority. |
| Render worker | `isProcessing`, `renderResult`, `errorMessage` | `jobId` already orders results. A worker crash only clears `isProcessing` and shows no message; tracked as a follow-up. |
