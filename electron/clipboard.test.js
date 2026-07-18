import { describe, it, expect } from 'vitest';
import { isYouTubeUrl } from './clipboard.js';

describe('isYouTubeUrl', () => {
  it('recognizes standard youtube.com links', () => {
    expect(isYouTubeUrl('https://www.youtube.com/watch?v=abc123')).toBe(true);
    expect(isYouTubeUrl('https://youtube.com/watch?v=abc123')).toBe(true);
  });

  it('recognizes youtu.be short links', () => {
    expect(isYouTubeUrl('https://youtu.be/abc123')).toBe(true);
  });

  it('recognizes the mobile subdomain', () => {
    expect(isYouTubeUrl('https://m.youtube.com/watch?v=abc123')).toBe(true);
  });

  it('rejects unrelated URLs and plain text', () => {
    expect(isYouTubeUrl('https://vimeo.com/12345')).toBe(false);
    expect(isYouTubeUrl('just some copied text')).toBe(false);
    expect(isYouTubeUrl('')).toBe(false);
  });

  it('handles clipboard text with surrounding whitespace', () => {
    expect(isYouTubeUrl('  https://youtu.be/abc123  \n')).toBe(true);
  });
});
