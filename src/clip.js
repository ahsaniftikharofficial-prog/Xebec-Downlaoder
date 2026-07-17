// Pure helpers for the clip scrubber — timestamp parsing/formatting and the
// clamping rules for dragging a handle. Kept separate from the scrubber's
// drag/DOM code so this logic can be unit-tested without a browser, same
// reasoning as the electron/ folder's pure-logic-vs-orchestration split.

export const MIN_CLIP_SECONDS = 1;

// Accepts plain seconds ("83") or M:SS / H:MM:SS ("1:23", "1:02:03").
// Returns null for anything unparseable rather than throwing, since this
// runs on every keystroke while the user is still typing.
export function parseTimestamp(text) {
  const trimmed = String(text).trim();
  if (trimmed === '') return null;

  if (/^\d+$/.test(trimmed)) return Number(trimmed);

  const parts = trimmed.split(':');
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) {
    return null;
  }

  const numbers = parts.map(Number);
  if (numbers.slice(1).some((n) => n > 59)) return null; // minutes/seconds out of range

  return numbers.reduce((total, n) => total * 60 + n, 0);
}

// Deliberately separate from App.jsx's formatDuration: that one shows
// "unknown length" for a null video duration, which doesn't apply here —
// a clip time is always a real number once a video is loaded.
export function formatTimestamp(totalSeconds) {
  const safe = Math.max(0, Math.round(totalSeconds || 0));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Moving the start handle can never cross past (end - MIN_CLIP_SECONDS);
// moving the end handle can never cross before (start + MIN_CLIP_SECONDS).
// Both handles are clamped to the video's actual duration. Used by both the
// scrubber drag and the timestamp fallback inputs, so dragging and typing
// can never disagree on what's a valid range.
export function moveClipHandle({ which, time, start, end, duration }) {
  const clamped = Math.min(Math.max(Math.round(time), 0), Math.round(duration || 0));

  if (which === 'start') {
    return { start: Math.min(clamped, end - MIN_CLIP_SECONDS), end };
  }
  return { start, end: Math.max(clamped, start + MIN_CLIP_SECONDS) };
}
