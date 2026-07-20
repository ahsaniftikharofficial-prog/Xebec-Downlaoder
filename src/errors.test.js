import { describe, it, expect } from 'vitest';
import { cleanErrorMessage } from './errors';

describe('cleanErrorMessage', () => {
  it('strips the "Error invoking remote method" IPC wrapper down to the real message', () => {
    const raw = "Error invoking remote method 'video:getInfo': Error: ERROR: [youtube] _OBlgSz8sSM: This video is not available";
    expect(cleanErrorMessage(raw)).toBe('ERROR: [youtube] _OBlgSz8sSM: This video is not available');
  });

  it('strips a leading "Error invoking remote method" prefix with any channel name', () => {
    const raw = "Error invoking remote method 'settings:set': Error: Could not write settings file";
    expect(cleanErrorMessage(raw)).toBe('Could not write settings file');
  });

  it('strips a bare leading "Error: " prefix with no IPC wrapper', () => {
    expect(cleanErrorMessage('Error: something went wrong')).toBe('something went wrong');
  });

  it('leaves an already-clean message untouched', () => {
    expect(cleanErrorMessage('This video is not available')).toBe('This video is not available');
  });

  it('passes non-string input through unchanged', () => {
    expect(cleanErrorMessage(undefined)).toBeUndefined();
    expect(cleanErrorMessage(null)).toBeNull();
  });

  it('trims surrounding whitespace', () => {
    expect(cleanErrorMessage('  Error: spaced out  ')).toBe('spaced out');
  });
});
