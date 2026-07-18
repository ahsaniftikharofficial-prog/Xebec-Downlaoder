import { describe, it, expect } from 'vitest';
import { buildHistoryEntry, addEntry, parseHistoryFile, MAX_HISTORY_ENTRIES } from './history.js';

describe('buildHistoryEntry', () => {
  it('builds a complete entry from the given fields', () => {
    expect(
      buildHistoryEntry({
        id: 'abc',
        downloadedAt: '2026-07-17T12:00:00.000Z',
        title: 'My Video',
        filePath: '/downloads/My Video.mp4',
        url: 'https://www.youtube.com/watch?v=abc',
        type: 'video',
        verified: true,
      })
    ).toEqual({
      id: 'abc',
      downloadedAt: '2026-07-17T12:00:00.000Z',
      title: 'My Video',
      filePath: '/downloads/My Video.mp4',
      url: 'https://www.youtube.com/watch?v=abc',
      type: 'video',
      verified: true,
    });
  });

  it('falls back to "Untitled" and false verified when missing', () => {
    const entry = buildHistoryEntry({ id: 'x', downloadedAt: 'now', filePath: '/a.mp4', url: 'u', type: 'clip' });
    expect(entry.title).toBe('Untitled');
    expect(entry.verified).toBe(false);
  });
});

describe('addEntry', () => {
  it('prepends the new entry so newest is first', () => {
    const existing = [{ id: 'old' }];
    expect(addEntry(existing, { id: 'new' })).toEqual([{ id: 'new' }, { id: 'old' }]);
  });

  it('caps the list at MAX_HISTORY_ENTRIES, dropping the oldest', () => {
    const existing = Array.from({ length: MAX_HISTORY_ENTRIES }, (_, i) => ({ id: `old-${i}` }));
    const result = addEntry(existing, { id: 'new' });
    expect(result).toHaveLength(MAX_HISTORY_ENTRIES);
    expect(result[0]).toEqual({ id: 'new' });
    expect(result).not.toContainEqual({ id: `old-${MAX_HISTORY_ENTRIES - 1}` });
  });
});

describe('parseHistoryFile', () => {
  it('parses a valid history array', () => {
    expect(parseHistoryFile('[{"id":"a"}]')).toEqual([{ id: 'a' }]);
  });

  it('returns an empty array for corrupted or non-array JSON', () => {
    expect(parseHistoryFile('not json')).toEqual([]);
    expect(parseHistoryFile('{"not":"an array"}')).toEqual([]);
    expect(parseHistoryFile('')).toEqual([]);
  });
});
