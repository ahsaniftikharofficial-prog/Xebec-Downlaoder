import path from 'path';
import { describe, it, expect } from 'vitest';
import {
  buildInfoArgs,
  parseVideoInfo,
  extractResolutions,
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
  it('extracts the fields the UI needs, including this video\'s real resolutions', () => {
    const json = JSON.stringify({
      id: 'abc123',
      title: 'A Test Video',
      duration: 125.4,
      thumbnail: 'https://example.com/thumb.jpg',
      uploader: 'Some Channel',
      formats: [
        { vcodec: 'avc1', height: 720 },
        { vcodec: 'vp9', height: 1080 },
        { vcodec: 'none', height: 9999 }, // audio-only format, must be ignored
      ],
    });
    expect(parseVideoInfo(json)).toEqual({
      id: 'abc123',
      title: 'A Test Video',
      duration: 125.4,
      thumbnail: 'https://example.com/thumb.jpg',
      uploader: 'Some Channel',
      resolutions: [1080, 720],
    });
  });

  it('falls back to null/empty for missing optional fields', () => {
    const json = JSON.stringify({ id: 'abc123', title: 'No Duration' });
    const result = parseVideoInfo(json);
    expect(result.duration).toBeNull();
    expect(result.thumbnail).toBeNull();
    expect(result.resolutions).toEqual([]);
  });
});

describe('extractResolutions', () => {
  it('returns distinct video heights, highest first', () => {
    const formats = [
      { vcodec: 'vp9', height: 1080 },
      { vcodec: 'avc1', height: 720 },
      { vcodec: 'vp9', height: 1080 }, // duplicate on purpose
      { vcodec: 'none', height: 9999 }, // audio-only, must be ignored
      { vcodec: 'avc1', height: 360 },
    ];
    expect(extractResolutions(formats)).toEqual([1080, 720, 360]);
  });

  it('returns an empty list when there are no formats at all', () => {
    expect(extractResolutions(undefined)).toEqual([]);
    expect(extractResolutions([])).toEqual([]);
  });

  it('ignores formats with no height field', () => {
    const formats = [{ vcodec: 'avc1' }, { vcodec: 'avc1', height: 480 }];
    expect(extractResolutions(formats)).toEqual([480]);
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

  it('defaults to best quality and mp4 when nothing is selected', () => {
    const args = buildDownloadArgs({ ...base, section: null });
    expect(args[args.indexOf('-f') + 1]).toBe('bv*+ba/b');
    expect(args[args.indexOf('--merge-output-format') + 1]).toBe('mp4');
    expect(args[args.indexOf('--remux-video') + 1]).toBe('mp4');
  });

  it('caps the format selector to the chosen resolution', () => {
    const args = buildDownloadArgs({ ...base, section: null, quality: 1080 });
    expect(args[args.indexOf('-f') + 1]).toBe('bv*[height<=1080]+ba/b[height<=1080]');
  });

  it('uses the chosen container for both merge and remux', () => {
    const args = buildDownloadArgs({ ...base, section: null, format: 'mkv' });
    expect(args[args.indexOf('--merge-output-format') + 1]).toBe('mkv');
    expect(args[args.indexOf('--remux-video') + 1]).toBe('mkv');
  });

  it('switches to audio-only extraction and drops the video container flags', () => {
    const args = buildDownloadArgs({ ...base, section: null, audioOnly: true, audioFormat: 'wav' });
    expect(args[args.indexOf('-f') + 1]).toBe('bestaudio/best');
    expect(args).toContain('-x');
    expect(args[args.indexOf('--audio-format') + 1]).toBe('wav');
    expect(args).not.toContain('--merge-output-format');
    expect(args).not.toContain('--remux-video');
  });

  it('defaults audio-only to mp3 when no audio format is chosen', () => {
    const args = buildDownloadArgs({ ...base, section: null, audioOnly: true });
    expect(args[args.indexOf('--audio-format') + 1]).toBe('mp3');
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
