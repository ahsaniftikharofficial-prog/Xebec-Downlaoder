import path from 'path';
import { describe, it, expect } from 'vitest';
import {
  sanitizeFilename,
  buildThumbnailOutputPath,
  buildMetadataOutputPath,
  guessExtensionFromUrl,
  buildThumbnailConvertArgs,
  buildMetadataContent,
} from './assets.js';

describe('sanitizeFilename', () => {
  it('replaces Windows-forbidden characters', () => {
    expect(sanitizeFilename('Q&A: What Is "AI"? <2024>')).not.toMatch(/[<>:"?*]/);
  });

  it('strips trailing dots and spaces', () => {
    expect(sanitizeFilename('Trailing dots... ')).toBe('Trailing dots');
  });

  it('falls back to "video" for empty or fully-stripped input', () => {
    expect(sanitizeFilename('')).toBe('video');
    expect(sanitizeFilename(undefined)).toBe('video');
  });

  it('leaves an already-safe title untouched', () => {
    expect(sanitizeFilename('A Normal Title')).toBe('A Normal Title');
  });
});

describe('buildThumbnailOutputPath', () => {
  it('names the file with the video id and a thumbnail suffix', () => {
    const result = buildThumbnailOutputPath('D:\\Downloads', 'My Video', 'abc123', 'jpg');
    expect(result).toBe(path.join('D:\\Downloads', 'My Video [abc123] - thumbnail.jpg'));
  });

  it('sanitizes the title before building the path', () => {
    const result = buildThumbnailOutputPath('D:\\Downloads', 'Bad:Title?', 'abc123', 'png');
    const filename = path.basename(result);
    expect(filename).not.toMatch(/[:?]/);
  });
});

describe('buildMetadataOutputPath', () => {
  it('names the file with the video id and a metadata suffix', () => {
    const result = buildMetadataOutputPath('D:\\Downloads', 'My Video', 'abc123', 'json');
    expect(result).toBe(path.join('D:\\Downloads', 'My Video [abc123] - metadata.json'));
  });
});

describe('guessExtensionFromUrl', () => {
  it('recognizes common image extensions in the url', () => {
    expect(guessExtensionFromUrl('https://i.ytimg.com/vi/x/hq.jpg')).toBe('jpg');
    expect(guessExtensionFromUrl('https://i.ytimg.com/vi/x/hq.webp?x=1')).toBe('webp');
    expect(guessExtensionFromUrl('https://i.ytimg.com/vi/x/hq.png')).toBe('png');
  });

  it('falls back to webp when the url gives no clue', () => {
    expect(guessExtensionFromUrl('https://i.ytimg.com/vi/x/hqdefault')).toBe('webp');
    expect(guessExtensionFromUrl('')).toBe('webp');
    expect(guessExtensionFromUrl(undefined)).toBe('webp');
  });
});

describe('buildThumbnailConvertArgs', () => {
  it('builds a simple overwrite-and-convert ffmpeg call', () => {
    const args = buildThumbnailConvertArgs('C:\\tmp\\src.webp', 'C:\\Downloads\\out.jpg');
    expect(args).toEqual(['-y', '-i', 'C:\\tmp\\src.webp', 'C:\\Downloads\\out.jpg']);
  });
});

describe('buildMetadataContent', () => {
  const info = {
    id: 'abc123',
    title: 'My Video',
    channel: 'My Channel',
    uploadDate: '2024-01-15',
    duration: 125.4,
    url: 'https://youtu.be/abc123',
    description: 'A description.',
  };

  it('produces valid, complete JSON by default', () => {
    const content = buildMetadataContent(info, 'json');
    expect(() => JSON.parse(content)).not.toThrow();
    expect(JSON.parse(content)).toEqual(info);
  });

  it('produces a readable text summary for txt', () => {
    const content = buildMetadataContent(info, 'txt');
    expect(content).toContain('Title: My Video');
    expect(content).toContain('Channel: My Channel');
    expect(content).toContain('Upload date: 2024-01-15');
    expect(content).toContain('A description.');
  });

  it('falls back to "Unknown" for missing fields in the txt format', () => {
    const content = buildMetadataContent({}, 'txt');
    expect(content).toContain('Title: Unknown');
    expect(content).toContain('Channel: Unknown');
  });

  it('handles a null info object without throwing', () => {
    expect(() => buildMetadataContent(null, 'json')).not.toThrow();
  });
});
