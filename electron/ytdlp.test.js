import path from 'path';
import { describe, it, expect } from 'vitest';
import {
  buildInfoArgs,
  parseVideoInfo,
  extractResolutions,
  extractThumbnails,
  extractSubtitleTracks,
  formatUploadDate,
  buildOutputTemplate,
  buildDownloadArgs,
  buildSubtitleArgs,
  parseProgressLine,
  parseSubtitleFilename,
  isLikelyFilePath,
  extractErrorMessage,
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
      thumbnails: [{ url: 'https://example.com/thumb.jpg', width: 1280, height: 720 }],
      uploader: 'Some Channel',
      channel: 'Some Channel (real name)',
      upload_date: '20240115',
      description: 'A description.',
      webpage_url: 'https://youtu.be/abc123',
      formats: [
        { vcodec: 'avc1', height: 720 },
        { vcodec: 'vp9', height: 1080 },
        { vcodec: 'none', height: 9999 }, // audio-only format, must be ignored
      ],
      subtitles: { en: [{ ext: 'vtt' }] },
      automatic_captions: { fr: [{ ext: 'vtt' }] },
    });
    expect(parseVideoInfo(json)).toEqual({
      id: 'abc123',
      title: 'A Test Video',
      duration: 125.4,
      thumbnail: 'https://example.com/thumb.jpg',
      thumbnails: [{ id: null, url: 'https://example.com/thumb.jpg', width: 1280, height: 720 }],
      uploader: 'Some Channel',
      channel: 'Some Channel (real name)',
      uploadDate: '2024-01-15',
      description: 'A description.',
      url: 'https://youtu.be/abc123',
      resolutions: [1080, 720],
      subtitleTracks: [
        { code: 'en', name: 'en', auto: false },
        { code: 'fr', name: 'fr', auto: true },
      ],
    });
  });

  it('falls back to null/empty for missing optional fields', () => {
    const json = JSON.stringify({ id: 'abc123', title: 'No Duration' });
    const result = parseVideoInfo(json);
    expect(result.duration).toBeNull();
    expect(result.thumbnail).toBeNull();
    expect(result.thumbnails).toEqual([]);
    expect(result.channel).toBeNull();
    expect(result.uploadDate).toBeNull();
    expect(result.description).toBeNull();
    expect(result.url).toBeNull();
    expect(result.resolutions).toEqual([]);
    expect(result.subtitleTracks).toEqual([]);
  });

  it('falls back "channel" to "uploader" when the extractor has no channel field', () => {
    const json = JSON.stringify({ id: 'abc123', title: 'X', uploader: 'Legacy Name' });
    expect(parseVideoInfo(json).channel).toBe('Legacy Name');
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

describe('extractErrorMessage', () => {
  it('drops WARNING lines and keeps only the ERROR line', () => {
    const stderr = [
      'WARNING: [youtube] No supported JavaScript runtime could be found. Only deno is enabled by default; to use another runtime add --js-runtimes RUNTIME[:PATH] to your command/config. YouTube extraction without a JS runtime has been deprecated, and some formats may be missing. See https://github.com/yt-dlp/yt-dlp/wiki/EJS for details on installing one',
      'ERROR: [youtube] _OBlgSz8sSM: This video is not available',
    ].join('\n');
    expect(extractErrorMessage(stderr)).toBe('ERROR: [youtube] _OBlgSz8sSM: This video is not available');
  });

  it('joins multiple ERROR lines with a space', () => {
    const stderr = 'ERROR: first problem\nERROR: second problem';
    expect(extractErrorMessage(stderr)).toBe('ERROR: first problem ERROR: second problem');
  });

  it('falls back to the full trimmed text when there is no ERROR line', () => {
    const stderr = 'WARNING: something odd happened\nsome other diagnostic line';
    expect(extractErrorMessage(stderr)).toBe(stderr);
  });

  it('returns an empty string for empty or missing stderr', () => {
    expect(extractErrorMessage('')).toBe('');
    expect(extractErrorMessage('   ')).toBe('');
    expect(extractErrorMessage(undefined)).toBe('');
  });

  it('is not fooled by "ERROR:" appearing mid-line — only line starts count', () => {
    const stderr = 'WARNING: retrying after ERROR: transient\nERROR: the real failure';
    expect(extractErrorMessage(stderr)).toBe('ERROR: the real failure');
  });
});

describe('extractThumbnails', () => {
  it('sorts by resolution, largest first', () => {
    const thumbnails = [
      { url: 'a', width: 320, height: 180 },
      { url: 'b', width: 1920, height: 1080 },
      { url: 'c', width: 640, height: 360 },
    ];
    expect(extractThumbnails(thumbnails).map((t) => t.url)).toEqual(['b', 'c', 'a']);
  });

  it('dedupes by url, keeping the first occurrence', () => {
    const thumbnails = [
      { url: 'a', width: 100, height: 100 },
      { url: 'a', width: 100, height: 100 },
    ];
    expect(extractThumbnails(thumbnails)).toHaveLength(1);
  });

  it('keeps thumbnails with unknown size but sorts them last', () => {
    const thumbnails = [
      { url: 'unknown' },
      { url: 'known', width: 100, height: 100 },
    ];
    const result = extractThumbnails(thumbnails);
    expect(result.map((t) => t.url)).toEqual(['known', 'unknown']);
    expect(result[1].width).toBeNull();
  });

  it('returns an empty list when there are no thumbnails at all', () => {
    expect(extractThumbnails(undefined)).toEqual([]);
    expect(extractThumbnails([])).toEqual([]);
  });

  it('skips malformed entries with no url', () => {
    expect(extractThumbnails([null, {}, { url: 'ok', width: 1, height: 1 }])).toHaveLength(1);
  });
});

describe('extractSubtitleTracks', () => {
  it('merges manual and auto tracks, sorted by language code', () => {
    const subtitles = { es: [{ ext: 'vtt' }], en: [{ ext: 'vtt' }] };
    const automaticCaptions = { fr: [{ ext: 'vtt' }] };
    expect(extractSubtitleTracks(subtitles, automaticCaptions)).toEqual([
      { code: 'en', name: 'en', auto: false },
      { code: 'es', name: 'es', auto: false },
      { code: 'fr', name: 'fr', auto: true },
    ]);
  });

  it('prefers the manual track over the auto track for the same language', () => {
    const subtitles = { en: [{ ext: 'vtt' }] };
    const automaticCaptions = { en: [{ ext: 'vtt' }] };
    const result = extractSubtitleTracks(subtitles, automaticCaptions);
    expect(result).toHaveLength(1);
    expect(result[0].auto).toBe(false);
  });

  it('uses the human-readable name when yt-dlp provides one', () => {
    const subtitles = { en: [{ ext: 'vtt', name: 'English' }] };
    expect(extractSubtitleTracks(subtitles, null)[0].name).toBe('English');
  });

  it('returns an empty list when neither subtitles nor auto captions exist', () => {
    expect(extractSubtitleTracks(null, null)).toEqual([]);
    expect(extractSubtitleTracks({}, {})).toEqual([]);
  });
});

describe('formatUploadDate', () => {
  it('formats a yt-dlp YYYYMMDD date into YYYY-MM-DD', () => {
    expect(formatUploadDate('20240115')).toBe('2024-01-15');
  });

  it('returns null for missing or malformed dates', () => {
    expect(formatUploadDate(undefined)).toBeNull();
    expect(formatUploadDate(null)).toBeNull();
    expect(formatUploadDate('2024-01-15')).toBeNull();
    expect(formatUploadDate('')).toBeNull();
  });
});

describe('buildSubtitleArgs', () => {
  const base = {
    url: 'https://youtu.be/abc',
    outputTemplate: 'D:\\Downloads\\%(title)s.%(ext)s',
    ffmpegDir: 'D:\\App\\resources\\bin',
  };

  it('skips the video download and requests both manual and auto subs', () => {
    const args = buildSubtitleArgs({ ...base, langs: ['en', 'es'], format: 'srt' });
    expect(args).toContain('--skip-download');
    expect(args).toContain('--write-subs');
    expect(args).toContain('--write-auto-subs');
    expect(args[args.indexOf('--sub-langs') + 1]).toBe('en,es');
  });

  it('sets both --sub-format and --convert-subs to the chosen format', () => {
    const args = buildSubtitleArgs({ ...base, langs: ['en'], format: 'vtt' });
    expect(args[args.indexOf('--sub-format') + 1]).toBe('vtt');
    expect(args[args.indexOf('--convert-subs') + 1]).toBe('vtt');
  });

  it('defaults to srt when no format is given', () => {
    const args = buildSubtitleArgs({ ...base, langs: ['en'] });
    expect(args[args.indexOf('--sub-format') + 1]).toBe('srt');
  });

  it('ends with the url', () => {
    const args = buildSubtitleArgs({ ...base, langs: ['en'] });
    expect(args[args.length - 1]).toBe(base.url);
  });
});

describe('parseSubtitleFilename', () => {
  it('extracts language and extension from a matching filename', () => {
    expect(parseSubtitleFilename('My Video [abc123].en.srt', 'abc123')).toEqual({
      lang: 'en',
      ext: 'srt',
    });
  });

  it('handles region-variant language codes with hyphens', () => {
    expect(parseSubtitleFilename('My Video [abc123].en-US.vtt', 'abc123')).toEqual({
      lang: 'en-US',
      ext: 'vtt',
    });
  });

  it('handles a title that itself contains dots', () => {
    expect(parseSubtitleFilename('Mr. Robot S01E01 [abc123].en.srt', 'abc123')).toEqual({
      lang: 'en',
      ext: 'srt',
    });
  });

  it('returns null for a video file with no language segment', () => {
    expect(parseSubtitleFilename('My Video [abc123].mp4', 'abc123')).toBeNull();
  });

  it('returns null when the id does not match', () => {
    expect(parseSubtitleFilename('My Video [xyz789].en.srt', 'abc123')).toBeNull();
  });
});
