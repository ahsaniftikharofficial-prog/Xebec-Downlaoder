import path from 'path';
import { describe, it, expect } from 'vitest';
import {
  buildInfoArgs,
  parseVideoInfo,
  buildOutputTemplate,
  buildDownloadArgs,
  parseProgressLine,
  isLikelyFilePath,
} from './ytdlp.js';

describe('buildInfoArgs', () => {
  it('asks yt-dlp for a single JSON info dump', () => {
    expect(buildInfoArgs('https://youtu.be/abc')).toEqual([
      '-J', '--no-warnings', 'https://youtu.be/abc',
    ]);
  });
});

describe('parseVideoInfo', () => {
  it('extracts the fields the UI needs', () => {
    const json = JSON.stringify({
      id: 'abc123',
      title: 'A Test Video',
      duration: 125.4,
      thumbnail: 'https://example.com/thumb.jpg',
      uploader: 'Some Channel',
      formats: [{}, {}], // present in real output, should be ignored
    });
    expect(parseVideoInfo(json)).toEqual({
      id: 'abc123',
      title: 'A Test Video',
      duration: 125.4,
      thumbnail: 'https://example.com/thumb.jpg',
      uploader: 'Some Channel',
    });
  });

  it('falls back to null for missing optional fields', () => {
    const json = JSON.stringify({ id: 'abc123', title: 'No Duration' });
    const result = parseVideoInfo(json);
    expect(result.duration).toBeNull();
    expect(result.thumbnail).toBeNull();
  });
});

describe('buildOutputTemplate', () => {
  it('gives a plain download a plain filename template', () => {
    const result = buildOutputTemplate('D:\\Downloads', false);
    expect(result).toBe(path.join('D:\\Downloads', '%(title)s [%(id)s].%(ext)s'));
  });

  it('gives a section download a distinct suffix so it never overwrites the full video', () => {
    const result = buildOutputTemplate('D:\\Downloads', true);
    expect(result).toBe(path.join('D:\\Downloads', '%(title)s [%(id)s] (clip).%(ext)s'));
  });
});

describe('buildDownloadArgs', () => {
  const base = {
    url: 'https://youtu.be/abc',
    outputTemplate: 'D:\\Downloads\\%(title)s.%(ext)s',
    ffmpegDir: 'D:\\App\\resources\\bin',
  };

  it('builds a full-video download with no section flags', () => {
    const args = buildDownloadArgs({ ...base, section: null });
    expect(args).toContain('--merge-output-format');
    expect(args).toContain('--ffmpeg-location');
    expect(args).toContain(base.ffmpegDir);
    expect(args).not.toContain('--download-sections');
    expect(args[args.length - 1]).toBe(base.url);
  });

  it('adds --download-sections and --force-keyframes-at-cuts for a clip', () => {
    const args = buildDownloadArgs({ ...base, section: { start: 30, end: 90 } });
    const sectionIndex = args.indexOf('--download-sections');
    expect(sectionIndex).toBeGreaterThan(-1);
    expect(args[sectionIndex + 1]).toBe('*30-90');
    expect(args).toContain('--force-keyframes-at-cuts');
  });
});

describe('parseProgressLine', () => {
  it('parses a downloading update and computes percent from bytes', () => {
    const line = JSON.stringify({
      status: 'downloading',
      downloaded_bytes: 2097152,
      total_bytes: 10485760,
      eta: 8,
      speed: 524288,
    });
    const result = parseProgressLine(line);
    expect(result.status).toBe('downloading');
    expect(result.percent).toBeCloseTo(20, 1);
    expect(result.eta).toBe(8);
  });

  it('reports 100% on a finished update even with no byte fields', () => {
    const line = JSON.stringify({ status: 'finished' });
    expect(parseProgressLine(line).percent).toBe(100);
  });

  it('falls back to total_bytes_estimate when total_bytes is missing', () => {
    const line = JSON.stringify({
      status: 'downloading',
      downloaded_bytes: 50,
      total_bytes: null,
      total_bytes_estimate: 100,
    });
    expect(parseProgressLine(line).percent).toBeCloseTo(50, 1);
  });

  it('returns null for non-JSON log lines', () => {
    expect(parseProgressLine('[youtube] abc123: Downloading webpage')).toBeNull();
  });

  it('returns null for JSON that has no status field', () => {
    expect(parseProgressLine(JSON.stringify({ foo: 'bar' }))).toBeNull();
  });

  it('returns null for an empty line', () => {
    expect(parseProgressLine('   ')).toBeNull();
  });
});

describe('isLikelyFilePath', () => {
  it('recognizes a bare Windows absolute path', () => {
    expect(isLikelyFilePath('C:\\Users\\me\\Downloads\\video.mp4')).toBe(true);
  });

  it('rejects yt-dlp log lines', () => {
    expect(isLikelyFilePath('[Merger] Merging formats into "video.mp4"')).toBe(false);
  });

  it('rejects JSON progress lines', () => {
    expect(isLikelyFilePath(JSON.stringify({ status: 'downloading' }))).toBe(false);
  });

  it('rejects an empty line', () => {
    expect(isLikelyFilePath('')).toBe(false);
  });
});
