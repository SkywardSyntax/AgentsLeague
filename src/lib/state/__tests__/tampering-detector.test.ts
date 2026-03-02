import { describe, it, expect, beforeEach } from 'vitest';
import {
  computeChecksum,
  createChecksummedState,
  validateChecksummedState,
  saveStateWithChecksum,
  loadStateWithChecksum,
  isChecksumValid,
} from '../tampering-detector';

// Mock localStorage
class MockStorage implements Storage {
  private store = new Map<string, string>();
  get length() { return this.store.size; }
  clear() { this.store.clear(); }
  getItem(key: string) { return this.store.get(key) ?? null; }
  key(index: number) { return Array.from(this.store.keys())[index] ?? null; }
  removeItem(key: string) { this.store.delete(key); }
  setItem(key: string, value: string) { this.store.set(key, value); }
}

describe('tampering-detector', () => {
  let storage: MockStorage;

  beforeEach(() => {
    storage = new MockStorage();
  });

  describe('computeChecksum', () => {
    it('produces consistent checksums for same input', () => {
      const a = computeChecksum('hello');
      const b = computeChecksum('hello');
      expect(a).toBe(b);
    });

    it('produces different checksums for different input', () => {
      const a = computeChecksum('hello');
      const b = computeChecksum('world');
      expect(a).not.toBe(b);
    });

    it('returns 8-character hex string', () => {
      const result = computeChecksum('test');
      expect(result).toMatch(/^[0-9a-f]{8}$/);
    });
  });

  describe('createChecksummedState', () => {
    it('creates state with valid checksum', () => {
      const state = createChecksummedState({ count: 42 });
      expect(state.checksum).toBeDefined();
      expect(state.timestamp).toBeGreaterThan(0);
      expect(state.data).toEqual({ count: 42 });
    });
  });

  describe('validateChecksummedState', () => {
    it('validates untampered state', () => {
      const state = createChecksummedState({ name: 'test' });
      const result = validateChecksummedState(state);
      expect(result.valid).toBe(true);
      expect(result.data).toEqual({ name: 'test' });
    });

    it('rejects tampered data', () => {
      const state = createChecksummedState({ name: 'test' });
      (state as { data: { name: string } }).data.name = 'hacked';
      const result = validateChecksummedState(state);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Checksum mismatch');
    });

    it('rejects null state', () => {
      const result = validateChecksummedState(null);
      expect(result.valid).toBe(false);
    });

    it('rejects missing fields', () => {
      const result = validateChecksummedState({ data: 'test' });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Missing required fields');
    });

    it('rejects tampered checksum', () => {
      const state = createChecksummedState({ value: 123 });
      state.checksum = 'deadbeef';
      const result = validateChecksummedState(state);
      expect(result.valid).toBe(false);
    });
  });

  describe('saveStateWithChecksum / loadStateWithChecksum', () => {
    it('round-trips state correctly', () => {
      saveStateWithChecksum('key1', { items: [1, 2, 3] }, storage);
      const loaded = loadStateWithChecksum<{ items: number[] }>('key1', storage, { items: [] });
      expect(loaded.data).toEqual({ items: [1, 2, 3] });
      expect(loaded.tampered).toBe(false);
    });

    it('detects tampering after save', () => {
      saveStateWithChecksum('key2', { secret: 'abc' }, storage);
      // Tamper with stored data
      const raw = JSON.parse(storage.getItem('key2')!);
      raw.data.secret = 'hacked';
      storage.setItem('key2', JSON.stringify(raw));
      const loaded = loadStateWithChecksum('key2', storage, { secret: '' });
      expect(loaded.tampered).toBe(true);
      expect(loaded.data).toEqual({ secret: '' }); // fallback
    });

    it('returns fallback for missing keys', () => {
      const loaded = loadStateWithChecksum('nonexistent', storage, 'default');
      expect(loaded.data).toBe('default');
      expect(loaded.tampered).toBe(false);
    });
  });

  describe('isChecksumValid', () => {
    it('validates correct checksum', () => {
      const data = { x: 1 };
      const checksum = computeChecksum(JSON.stringify(data));
      expect(isChecksumValid(data, checksum)).toBe(true);
    });

    it('rejects incorrect checksum', () => {
      expect(isChecksumValid({ x: 1 }, 'wrong')).toBe(false);
    });
  });
});
