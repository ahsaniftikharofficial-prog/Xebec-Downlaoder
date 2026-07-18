import path from 'path';
import { describe, it, expect } from 'vitest';
import { getBinPath, firstLine, getWritableBinDir, getWritableBinPath, getVersionsDir } from './engine.js';

describe('getBinPath', () => {
  it('points inside resources/bin when running in dev', () => {
    const result = getBinPath('/project', true, 'yt-dlp.exe');
    const expected = path.join('/project', 'resources', 'bin', 'yt-dlp.exe');
    expect(result).toBe(expected);
  });

  it('points inside the packaged resources folder when not in dev', () => {
    const result = getBinPath('/packaged/resources', false, 'ffmpeg.exe');
    const expected = path.join('/packaged/resources', 'bin', 'ffmpeg.exe');
    expect(result).toBe(expected);
  });
});

describe('getWritableBinDir / getWritableBinPath', () => {
  it('points inside userData/engine/bin, never inside the app install dir', () => {
    const userData = path.join('/Users', 'me', 'AppData', 'Roaming', 'yt-downloader');
    expect(getWritableBinDir(userData)).toBe(path.join(userData, 'engine', 'bin'));
    expect(getWritableBinPath(userData, 'yt-dlp.exe')).toBe(
      path.join(userData, 'engine', 'bin', 'yt-dlp.exe')
    );
  });
});

describe('getVersionsDir', () => {
  it('points inside userData/engine/versions', () => {
    const userData = path.join('/Users', 'me', 'AppData', 'Roaming', 'yt-downloader');
    expect(getVersionsDir(userData)).toBe(path.join(userData, 'engine', 'versions'));
  });
});

describe('firstLine', () => {
  it('keeps only the first line of multi-line output', () => {
    const output = 'ffmpeg version 8.1\nbuilt with gcc\nconfiguration: --enable-gpl';
    expect(firstLine(output)).toBe('ffmpeg version 8.1');
  });

  it('trims surrounding whitespace', () => {
    expect(firstLine('  2025.06.09  \n')).toBe('2025.06.09');
  });
});
