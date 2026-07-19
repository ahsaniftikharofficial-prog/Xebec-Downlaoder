import { describe, it, expect } from 'vitest';
import { buildUpdateNotice, isMeaningfulUpdate } from './appUpdater.js';

describe('buildUpdateNotice', () => {
  it('reports a ready-to-install notice on update-downloaded', () => {
    expect(buildUpdateNotice('update-downloaded', { version: '1.2.0' })).toEqual({
      status: 'ready',
      version: '1.2.0',
    });
  });

  it('reports an error notice on error, reading the Error object message', () => {
    expect(buildUpdateNotice('error', new Error('network unreachable'))).toEqual({
      status: 'error',
      message: 'network unreachable',
    });
  });

  it('falls back to a generic message when the error has none', () => {
    expect(buildUpdateNotice('error', {})).toEqual({
      status: 'error',
      message: 'Update check failed.',
    });
  });

  it('stays silent for checking/available/not-available events', () => {
    expect(buildUpdateNotice('checking-for-update', undefined)).toBeNull();
    expect(buildUpdateNotice('update-available', { version: '1.2.0' })).toBeNull();
    expect(buildUpdateNotice('update-not-available', { version: '1.1.0' })).toBeNull();
  });
});

describe('isMeaningfulUpdate', () => {
  it('is true when the downloaded version is newer', () => {
    expect(isMeaningfulUpdate('1.0.0', '1.1.0')).toBe(true);
  });

  it('is false when the downloaded version matches the running version', () => {
    expect(isMeaningfulUpdate('1.1.0', '1.1.0')).toBe(false);
  });

  it('is false when the downloaded version is older (defends against a bad/reverted release)', () => {
    expect(isMeaningfulUpdate('1.1.0', '1.0.0')).toBe(false);
  });

  it('is false when there is no downloaded version', () => {
    expect(isMeaningfulUpdate('1.0.0', null)).toBe(false);
    expect(isMeaningfulUpdate('1.0.0', undefined)).toBe(false);
  });
});
