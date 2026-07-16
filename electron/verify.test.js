import { describe, it, expect } from 'vitest';
import {
  buildFfprobeArgs,
  parseFfprobeDurationOutput,
  isDurationCloseEnough,
  buildFfprobeImageArgs,
  parseFfprobeDimensionsOutput,
} from './verify.js';

describe('buildFfprobeArgs', () => {
  it('asks ffprobe for just the duration, as JSON', () => {
    const args = buildFfprobeArgs('C:\\Downloads\\video.mp4');
    expect(args).toContain('-show_entries');
    expect(args).toContain('format=duration');
    expect(args[args.length - 1]).toBe('C:\\Downloads\\video.mp4');
  });
});

describe('parseFfprobeDurationOutput', () => {
  it('parses the duration out of real ffprobe JSON output', () => {
    const json = JSON.stringify({ format: { duration: '125.400000' } });
    expect(parseFfprobeDurationOutput(json)).toBeCloseTo(125.4, 3);
  });

  it('returns null when duration is missing or unreadable', () => {
    expect(parseFfprobeDurationOutput(JSON.stringify({ format: {} }))).toBeNull();
    expect(parseFfprobeDurationOutput(JSON.stringify({}))).toBeNull();
  });
});

describe('isDurationCloseEnough', () => {
  it('accepts a close match within tolerance', () => {
    expect(isDurationCloseEnough(60.2, 60, 5)).toBe(true);
  });

  it('rejects a match outside tolerance', () => {
    expect(isDurationCloseEnough(40, 60, 5)).toBe(false);
  });

  it('rejects when either value is missing', () => {
    expect(isDurationCloseEnough(null, 60, 5)).toBe(false);
    expect(isDurationCloseEnough(60, null, 5)).toBe(false);
  });
});

describe('buildFfprobeImageArgs', () => {
  it('asks ffprobe for just width/height of the first video stream, as JSON', () => {
    const args = buildFfprobeImageArgs('C:\\Downloads\\thumb.jpg');
    expect(args).toContain('-show_entries');
    expect(args).toContain('stream=width,height');
    expect(args).toContain('-select_streams');
    expect(args[args.indexOf('-select_streams') + 1]).toBe('v:0');
    expect(args[args.length - 1]).toBe('C:\\Downloads\\thumb.jpg');
  });
});

describe('parseFfprobeDimensionsOutput', () => {
  it('parses width/height out of real ffprobe JSON output', () => {
    const json = JSON.stringify({ streams: [{ width: 1920, height: 1080 }] });
    expect(parseFfprobeDimensionsOutput(json)).toEqual({ width: 1920, height: 1080 });
  });

  it('returns nulls when there is no decodable video stream', () => {
    expect(parseFfprobeDimensionsOutput(JSON.stringify({ streams: [] }))).toEqual({
      width: null,
      height: null,
    });
    expect(parseFfprobeDimensionsOutput(JSON.stringify({}))).toEqual({ width: null, height: null });
  });
});
