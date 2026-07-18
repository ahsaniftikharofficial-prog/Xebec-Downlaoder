import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, mergeSettings, parseSettingsFile, ACCENT_COLORS } from './settings.js';

describe('mergeSettings', () => {
  it('applies a valid update on top of current settings', () => {
    expect(mergeSettings(DEFAULT_SETTINGS, { defaultQuality: '1080' })).toEqual({
      ...DEFAULT_SETTINGS,
      defaultQuality: '1080',
    });
  });

  it('normalizes an empty/falsy folder or quality back to null', () => {
    const withValues = { ...DEFAULT_SETTINGS, defaultFolder: '/some/path', defaultQuality: '1080' };
    expect(mergeSettings(withValues, { defaultFolder: '', defaultQuality: '' })).toEqual({
      ...withValues,
      defaultFolder: null,
      defaultQuality: null,
    });
  });

  it('ignores an accent color that has no palette', () => {
    expect(mergeSettings(DEFAULT_SETTINGS, { accentColor: 'not-a-real-color' })).toEqual(DEFAULT_SETTINGS);
  });

  it('accepts any color in ACCENT_COLORS', () => {
    for (const color of ACCENT_COLORS) {
      expect(mergeSettings(DEFAULT_SETTINGS, { accentColor: color }).accentColor).toBe(color);
    }
  });

  it('leaves keys that were not part of the update untouched', () => {
    const current = { ...DEFAULT_SETTINGS, defaultFolder: '/a' };
    expect(mergeSettings(current, { accentColor: 'blue' })).toEqual({ ...current, accentColor: 'blue' });
  });
});

describe('parseSettingsFile', () => {
  it('parses valid settings and fills in any missing keys with defaults', () => {
    expect(parseSettingsFile('{"accentColor":"blue"}')).toEqual({ ...DEFAULT_SETTINGS, accentColor: 'blue' });
  });

  it('falls back to defaults for corrupted or non-object JSON', () => {
    expect(parseSettingsFile('not json')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettingsFile('[1,2,3]')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettingsFile('')).toEqual(DEFAULT_SETTINGS);
  });
});
