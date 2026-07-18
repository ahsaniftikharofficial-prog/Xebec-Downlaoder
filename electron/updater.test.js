import { describe, it, expect } from 'vitest';
import {
  compareVersions,
  isNewerVersion,
  parseYtDlpRelease,
  pickFfmpegAsset,
  parseFfmpegRelease,
  buildVersionedFilename,
  selectVersionsToPrune,
  mergeEngineMetadata,
  parseEngineMetadata,
} from './updater.js';

describe('compareVersions', () => {
  it('treats identical versions as equal', () => {
    expect(compareVersions('2025.06.09', '2025.06.09')).toBe(0);
  });

  it('detects a newer date-based version', () => {
    expect(compareVersions('2025.06.09', '2025.07.01')).toBe(-1);
    expect(compareVersions('2025.07.01', '2025.06.09')).toBe(1);
  });

  it('handles a trailing hotfix segment as newer than the base version', () => {
    expect(compareVersions('2023.03.04', '2023.03.04.1')).toBe(-1);
    expect(compareVersions('2023.03.04.1', '2023.03.04')).toBe(1);
  });

  it('treats missing/empty parts as zero', () => {
    expect(compareVersions('', '2025.01.01')).toBe(-1);
  });
});

describe('isNewerVersion', () => {
  it('is true when latest is newer', () => {
    expect(isNewerVersion('2025.06.09', '2025.07.01')).toBe(true);
  });

  it('is false when equal or older', () => {
    expect(isNewerVersion('2025.06.09', '2025.06.09')).toBe(false);
    expect(isNewerVersion('2025.07.01', '2025.06.09')).toBe(false);
  });

  it('is false when either version is missing', () => {
    expect(isNewerVersion(null, '2025.06.09')).toBe(false);
    expect(isNewerVersion('2025.06.09', null)).toBe(false);
  });
});

describe('parseYtDlpRelease', () => {
  it('extracts the version tag and the yt-dlp.exe download URL', () => {
    const release = {
      tag_name: '2025.07.01',
      assets: [
        { name: 'yt-dlp', browser_download_url: 'https://example.com/yt-dlp' },
        { name: 'yt-dlp.exe', browser_download_url: 'https://example.com/yt-dlp.exe' },
        { name: 'yt-dlp.tar.gz', browser_download_url: 'https://example.com/yt-dlp.tar.gz' },
      ],
    };
    expect(parseYtDlpRelease(release)).toEqual({
      version: '2025.07.01',
      downloadUrl: 'https://example.com/yt-dlp.exe',
    });
  });

  it('throws a clear error when yt-dlp.exe is missing from the release', () => {
    expect(() => parseYtDlpRelease({ tag_name: '2025.07.01', assets: [] })).toThrow(/yt-dlp\.exe/);
  });

  it('throws when the release JSON is malformed or empty', () => {
    expect(() => parseYtDlpRelease({})).toThrow();
    expect(() => parseYtDlpRelease(null)).toThrow();
  });
});

describe('pickFfmpegAsset', () => {
  const assets = [
    { name: 'ffmpeg-n7.1-latest-win64-gpl-7.1.zip' },
    { name: 'ffmpeg-n7.1-latest-win64-gpl-shared-7.1.zip' },
    { name: 'ffmpeg-n7.1-latest-win64-lgpl-7.1.zip' },
    { name: 'ffmpeg-n7.1-latest-winarm64-gpl-7.1.zip' },
    { name: 'ffmpeg-n7.1-latest-linux64-gpl-7.1.zip' },
  ];

  it('picks the static (non-shared) 64-bit Windows GPL build', () => {
    expect(pickFfmpegAsset(assets)?.name).toBe('ffmpeg-n7.1-latest-win64-gpl-7.1.zip');
  });

  it('returns null when nothing matches', () => {
    expect(pickFfmpegAsset([{ name: 'ffmpeg-linux64-gpl.zip' }])).toBeNull();
    expect(pickFfmpegAsset([])).toBeNull();
    expect(pickFfmpegAsset(null)).toBeNull();
  });
});

describe('parseFfmpegRelease', () => {
  it('builds a marker from the asset name and its last-updated timestamp', () => {
    const release = {
      assets: [
        {
          name: 'ffmpeg-n7.1-latest-win64-gpl-7.1.zip',
          updated_at: '2026-07-01T00:00:00Z',
          browser_download_url: 'https://example.com/ffmpeg.zip',
        },
        { name: 'ffmpeg-n7.1-latest-win64-gpl-shared-7.1.zip', updated_at: '2026-07-01T00:00:00Z' },
      ],
    };
    expect(parseFfmpegRelease(release)).toEqual({
      marker: 'ffmpeg-n7.1-latest-win64-gpl-7.1.zip:2026-07-01T00:00:00Z',
      downloadUrl: 'https://example.com/ffmpeg.zip',
      assetName: 'ffmpeg-n7.1-latest-win64-gpl-7.1.zip',
    });
  });

  it('throws when no matching Windows build is present', () => {
    expect(() => parseFfmpegRelease({ assets: [] })).toThrow(/ffmpeg/i);
  });
});

describe('buildVersionedFilename', () => {
  it('inserts the version before the extension', () => {
    expect(buildVersionedFilename('yt-dlp.exe', '2025.06.09')).toBe('yt-dlp-2025.06.09.exe');
  });

  it('sanitizes characters that are not filename-safe', () => {
    expect(buildVersionedFilename('ffmpeg.exe', 'weird:name/2026')).toBe('ffmpeg-weird-name-2026.exe');
  });
});

describe('selectVersionsToPrune', () => {
  it('keeps the N most recent and returns the rest for deletion', () => {
    const files = [
      { name: 'a', savedAt: 1 },
      { name: 'b', savedAt: 3 },
      { name: 'c', savedAt: 2 },
      { name: 'd', savedAt: 4 },
    ];
    // Newest-first: d(4), b(3), c(2), a(1) — keep 2 newest, prune the rest.
    expect(selectVersionsToPrune(files, 2)).toEqual(['c', 'a']);
  });

  it('prunes nothing when there are fewer files than the keep count', () => {
    expect(selectVersionsToPrune([{ name: 'a', savedAt: 1 }], 3)).toEqual([]);
  });

  it('handles a non-array input safely', () => {
    expect(selectVersionsToPrune(null, 3)).toEqual([]);
  });
});

describe('mergeEngineMetadata', () => {
  it('merges per-binary fields without clobbering the other binary', () => {
    const current = {
      ytDlp: { lastCheckedAt: 't1', lastUpdate: null },
      ffmpeg: { lastCheckedAt: 't1', marker: 'm1', lastUpdate: null },
    };
    const result = mergeEngineMetadata(current, { ytDlp: { lastCheckedAt: 't2' } });
    expect(result.ytDlp.lastCheckedAt).toBe('t2');
    expect(result.ffmpeg).toEqual({ lastCheckedAt: 't1', marker: 'm1', lastUpdate: null });
  });

  it('falls back to defaults when current is missing or malformed', () => {
    const result = mergeEngineMetadata(null, {});
    expect(result.ytDlp.lastUpdate).toBeNull();
    expect(result.ffmpeg.marker).toBeNull();
  });
});

describe('parseEngineMetadata', () => {
  it('parses valid metadata JSON', () => {
    const json = JSON.stringify({
      ytDlp: { lastCheckedAt: 't1', lastUpdate: null },
      ffmpeg: { lastCheckedAt: 't1', marker: 'm1', lastUpdate: null },
    });
    expect(parseEngineMetadata(json).ffmpeg.marker).toBe('m1');
  });

  it('falls back to defaults for corrupted or empty JSON', () => {
    const result = parseEngineMetadata('not json');
    expect(result.ytDlp.lastCheckedAt).toBeNull();
    expect(result.ffmpeg.lastUpdate).toBeNull();
  });
});
