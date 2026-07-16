import path from 'path';
import { describe, it, expect } from 'vitest';
import { getBinPath, firstLine } from './engine.js';

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

describe('firstLine', () => {
  it('keeps only the first line of multi-line output', () => {
    const output = 'ffmpeg version 8.1\nbuilt with gcc\nconfiguration: --enable-gpl';
    expect(firstLine(output)).toBe('ffmpeg version 8.1');
  });

  it('trims surrounding whitespace', () => {
    expect(firstLine('  2025.06.09  \n')).toBe('2025.06.09');
  });
});
