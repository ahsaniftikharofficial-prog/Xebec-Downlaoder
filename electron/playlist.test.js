import { describe, it, expect, vi } from 'vitest';
import {
  isPlaylistUrl,
  buildPlaylistInfoArgs,
  parsePlaylistInfo,
  processQueue,
} from './playlist.js';

describe('isPlaylistUrl', () => {
  it('recognizes a plain playlist page', () => {
    expect(isPlaylistUrl('https://www.youtube.com/playlist?list=PLabc123')).toBe(true);
  });

  it('recognizes a watch URL that is part of a playlist', () => {
    expect(isPlaylistUrl('https://www.youtube.com/watch?v=abc123&list=PLxyz')).toBe(true);
  });

  it('treats a plain single-video URL as not a playlist', () => {
    expect(isPlaylistUrl('https://www.youtube.com/watch?v=abc123')).toBe(false);
    expect(isPlaylistUrl('https://youtu.be/abc123')).toBe(false);
  });

  it('returns false instead of throwing on an unparseable URL', () => {
    expect(isPlaylistUrl('not a url')).toBe(false);
    expect(isPlaylistUrl('')).toBe(false);
  });
});

describe('buildPlaylistInfoArgs', () => {
  it('asks yt-dlp for a fast listing, not full per-video info', () => {
    expect(buildPlaylistInfoArgs('https://www.youtube.com/playlist?list=PLabc')).toEqual([
      '-J', '--flat-playlist', '--no-warnings', 'https://www.youtube.com/playlist?list=PLabc',
    ]);
  });
});

describe('parsePlaylistInfo', () => {
  it("extracts entries and rebuilds each watch URL from its id", () => {
    const json = JSON.stringify({
      title: 'My Playlist',
      id: 'PLabc123',
      entries: [
        { id: 'vid1', title: 'First Video', duration: 125 },
        { id: 'vid2', title: 'Second Video', duration: 340 },
      ],
    });
    expect(parsePlaylistInfo(json)).toEqual({
      title: 'My Playlist',
      id: 'PLabc123',
      entries: [
        { id: 'vid1', title: 'First Video', duration: 125, url: 'https://www.youtube.com/watch?v=vid1' },
        { id: 'vid2', title: 'Second Video', duration: 340, url: 'https://www.youtube.com/watch?v=vid2' },
      ],
    });
  });

  it('drops entries with no usable id, like private or deleted videos', () => {
    const json = JSON.stringify({
      title: 'My Playlist',
      id: 'PLabc123',
      entries: [
        { id: 'vid1', title: 'First Video', duration: 125 },
        null,
        { title: 'No id at all' },
      ],
    });
    expect(parsePlaylistInfo(json).entries).toEqual([
      { id: 'vid1', title: 'First Video', duration: 125, url: 'https://www.youtube.com/watch?v=vid1' },
    ]);
  });

  it('falls back sensibly when title/duration are missing', () => {
    const json = JSON.stringify({ entries: [{ id: 'vid1' }] });
    const result = parsePlaylistInfo(json);
    expect(result.title).toBe('Playlist');
    expect(result.entries).toEqual([
      { id: 'vid1', title: 'vid1', duration: null, url: 'https://www.youtube.com/watch?v=vid1' },
    ]);
  });
});

describe('processQueue', () => {
  it('attempts every item even when one fails midway through', async () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const downloadItem = vi.fn((item) => {
      if (item.id === 'b') return Promise.reject(new Error('boom'));
      return Promise.resolve({ filePath: `/downloads/${item.id}.mp4` });
    });

    const results = await processQueue({ items, downloadItem });

    expect(downloadItem).toHaveBeenCalledTimes(3);
    expect(results).toEqual([
      { id: 'a', status: 'done', result: { filePath: '/downloads/a.mp4' } },
      { id: 'b', status: 'failed', error: 'boom' },
      { id: 'c', status: 'done', result: { filePath: '/downloads/c.mp4' } },
    ]);
  });

  it('reports per-item status changes as it goes, not just at the end', async () => {
    const items = [{ id: 'a' }, { id: 'b' }];
    const downloadItem = (item) =>
      item.id === 'b' ? Promise.reject(new Error('nope')) : Promise.resolve({ ok: true });
    const updates = [];

    await processQueue({
      items,
      downloadItem,
      onItemUpdate: (id, update) => updates.push({ id, ...update }),
    });

    expect(updates).toEqual([
      { id: 'a', status: 'downloading' },
      { id: 'a', status: 'done', result: { ok: true } },
      { id: 'b', status: 'downloading' },
      { id: 'b', status: 'failed', error: 'nope' },
    ]);
  });

  it('forwards per-item progress updates through onItemUpdate', async () => {
    const items = [{ id: 'a' }];
    const downloadItem = (item, onProgress) => {
      onProgress({ percent: 50 });
      return Promise.resolve({ ok: true });
    };
    const updates = [];

    await processQueue({
      items,
      downloadItem,
      onItemUpdate: (id, update) => updates.push({ id, ...update }),
    });

    expect(updates).toEqual([
      { id: 'a', status: 'downloading' },
      { id: 'a', status: 'downloading', progress: { percent: 50 } },
      { id: 'a', status: 'done', result: { ok: true } },
    ]);
  });

  it('processes items strictly one at a time, not in parallel', async () => {
    const running = [];
    let maxConcurrent = 0;
    const items = [{ id: 'a' }, { id: 'b' }];
    const downloadItem = async (item) => {
      running.push(item.id);
      maxConcurrent = Math.max(maxConcurrent, running.length);
      await new Promise((r) => setTimeout(r, 5));
      running.pop();
      return { ok: true };
    };

    await processQueue({ items, downloadItem });

    expect(maxConcurrent).toBe(1);
  });
});
