import { describe, it, expect } from 'vitest';
import { parseTimestamp, formatTimestamp, moveClipHandle } from './clip';

describe('parseTimestamp', () => {
  it('parses plain seconds', () => {
    expect(parseTimestamp('83')).toBe(83);
    expect(parseTimestamp('0')).toBe(0);
  });

  it('parses M:SS', () => {
    expect(parseTimestamp('1:23')).toBe(83);
    expect(parseTimestamp('0:05')).toBe(5);
  });

  it('parses H:MM:SS', () => {
    expect(parseTimestamp('1:02:03')).toBe(3723);
  });

  it('returns null for unparseable or empty text', () => {
    expect(parseTimestamp('')).toBeNull();
    expect(parseTimestamp('abc')).toBeNull();
    expect(parseTimestamp('1:2:3:4')).toBeNull();
    expect(parseTimestamp('1:99')).toBeNull(); // seconds out of range
  });
});

describe('formatTimestamp', () => {
  it('formats seconds as M:SS', () => {
    expect(formatTimestamp(83)).toBe('1:23');
    expect(formatTimestamp(5)).toBe('0:05');
    expect(formatTimestamp(0)).toBe('0:00');
  });

  it('never goes negative, even for bad input', () => {
    expect(formatTimestamp(-10)).toBe('0:00');
    expect(formatTimestamp(null)).toBe('0:00');
  });
});

describe('moveClipHandle', () => {
  it('moves the start handle within range', () => {
    expect(moveClipHandle({ which: 'start', time: 20, start: 10, end: 100, duration: 200 })).toEqual({
      start: 20,
      end: 100,
    });
  });

  it('never lets the start handle cross the end handle', () => {
    expect(moveClipHandle({ which: 'start', time: 150, start: 10, end: 100, duration: 200 })).toEqual({
      start: 99, // clamped to end - MIN_CLIP_SECONDS (1)
      end: 100,
    });
  });

  it('never lets the end handle cross the start handle', () => {
    expect(moveClipHandle({ which: 'end', time: 5, start: 10, end: 100, duration: 200 })).toEqual({
      start: 10,
      end: 11, // clamped to start + MIN_CLIP_SECONDS (1)
    });
  });

  it('clamps to the video duration on both ends', () => {
    expect(moveClipHandle({ which: 'end', time: 500, start: 10, end: 100, duration: 200 })).toEqual({
      start: 10,
      end: 200,
    });
    expect(moveClipHandle({ which: 'start', time: -50, start: 10, end: 100, duration: 200 })).toEqual({
      start: 0,
      end: 100,
    });
  });

  it('rounds to whole seconds', () => {
    expect(moveClipHandle({ which: 'start', time: 20.7, start: 10, end: 100, duration: 200 })).toEqual({
      start: 21,
      end: 100,
    });
  });
});
