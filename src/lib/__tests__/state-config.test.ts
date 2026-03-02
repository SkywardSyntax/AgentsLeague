import { describe, it, expect } from 'vitest';
import { validateStateConfig } from '@/lib/state/state-config';

describe('StateConfigSchema', () => {
  it('accepts a fully valid configuration', () => {
    const config = validateStateConfig({
      storageKey: 'my-app-state', version: '2.1.0',
      maxSizeBytes: 1048576, autoSaveIntervalMs: 10000, enableCompression: true,
    });
    expect(config.storageKey).toBe('my-app-state');
    expect(config.enableCompression).toBe(true);
  });

  it('applies defaults when fields are omitted', () => {
    const config = validateStateConfig({});
    expect(config.storageKey).toBe('app-state');
    expect(config.version).toBe('1.0.0');
    expect(config.maxSizeBytes).toBe(5 * 1024 * 1024);
    expect(config.autoSaveIntervalMs).toBe(5000);
    expect(config.enableCompression).toBe(false);
  });

  it('rejects storage key with invalid characters', () => {
    expect(() => validateStateConfig({ storageKey: 'my key!' })).toThrow();
    expect(() => validateStateConfig({ storageKey: 'a b' })).toThrow();
  });

  it('rejects empty storage key', () => {
    expect(() => validateStateConfig({ storageKey: '' })).toThrow();
  });

  it('rejects invalid version format', () => {
    expect(() => validateStateConfig({ version: 'v1.0' })).toThrow();
    expect(() => validateStateConfig({ version: '1.0' })).toThrow();
    expect(() => validateStateConfig({ version: 'latest' })).toThrow();
  });

  it('rejects max size exceeding 50MB', () => {
    expect(() => validateStateConfig({ maxSizeBytes: 51 * 1024 * 1024 })).toThrow();
  });

  it('rejects max size below 1KB', () => {
    expect(() => validateStateConfig({ maxSizeBytes: 512 })).toThrow();
  });

  it('rejects negative auto-save interval', () => {
    expect(() => validateStateConfig({ autoSaveIntervalMs: -1 })).toThrow();
  });

  it('allows zero auto-save interval (disable auto-save)', () => {
    const config = validateStateConfig({ autoSaveIntervalMs: 0 });
    expect(config.autoSaveIntervalMs).toBe(0);
  });

  it('rejects storage key starting with dash', () => {
    expect(() => validateStateConfig({ storageKey: '-invalid' })).toThrow();
  });
});
