import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_RENDER_SETTINGS } from '../data/presets';
import { IDLE_TUNE, isPendingRequest, type TuneSession, tuneReducer } from './tuneSession';

const mine = { ...DEFAULT_RENDER_SETTINGS, contrast: 33 };
const tunedOnce = { ...DEFAULT_RENDER_SETTINGS, contrast: 60 };

test('a tune resolves into a tuned session that remembers the original look', () => {
  let s: TuneSession = tuneReducer(IDLE_TUNE, { type: 'START', requestId: 1, current: mine });
  assert.equal(s.phase, 'tuning');
  s = tuneReducer(s, { type: 'RESOLVE', requestId: 1, summary: 'ok', source: 'local' });
  assert.deepEqual(s, { phase: 'tuned', snapshot: mine, summary: 'ok', source: 'local', notice: null });
});

test('a late answer for a superseded request is dropped', () => {
  let s = tuneReducer(IDLE_TUNE, { type: 'START', requestId: 1, current: mine });
  s = tuneReducer(s, { type: 'START', requestId: 2, current: mine });
  const late = tuneReducer(s, { type: 'RESOLVE', requestId: 1, summary: 'old', source: 'api' });
  assert.equal(late, s);
  assert.ok(isPendingRequest(s, 2));
  assert.ok(!isPendingRequest(s, 1));
});

test('cancelling (new image, preset, reset) drops an in-flight answer', () => {
  let s = tuneReducer(IDLE_TUNE, { type: 'START', requestId: 7, current: mine });
  s = tuneReducer(s, { type: 'CANCEL' });
  assert.equal(s, IDLE_TUNE);
  s = tuneReducer(s, { type: 'RESOLVE', requestId: 7, summary: 'stale', source: 'api' });
  assert.equal(s, IDLE_TUNE);
});

test('re-tuning keeps the pre-session snapshot so undo returns to the user look', () => {
  let s = tuneReducer(IDLE_TUNE, { type: 'START', requestId: 1, current: mine });
  s = tuneReducer(s, { type: 'RESOLVE', requestId: 1, summary: 'a', source: 'local' });
  s = tuneReducer(s, { type: 'START', requestId: 2, current: tunedOnce });
  assert.equal(s.phase === 'tuning' && s.snapshot, mine);
});

test('undo only applies to a finished tune', () => {
  const tuning = tuneReducer(IDLE_TUNE, { type: 'START', requestId: 1, current: mine });
  assert.equal(tuneReducer(tuning, { type: 'UNDO' }), tuning);
  const tuned = tuneReducer(tuning, { type: 'RESOLVE', requestId: 1, summary: 'a', source: 'api' });
  assert.equal(tuneReducer(tuned, { type: 'UNDO' }), IDLE_TUNE);
  assert.equal(tuneReducer(IDLE_TUNE, { type: 'UNDO' }), IDLE_TUNE);
});
