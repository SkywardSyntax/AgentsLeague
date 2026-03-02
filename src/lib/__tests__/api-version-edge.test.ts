import { describe, expect, it } from 'vitest';
import {
  parseApiVersion,
  isSupported,
  getVersionFromHeaders,
  negotiateVersion,
  API_VERSION_HEADER,
  CURRENT_API_VERSION,
} from '@/lib/server/api-version';

describe('api-version edge cases', () => {
  describe('parseApiVersion', () => {
    it('parses v1 as valid', () => {
      expect(parseApiVersion('v1')).toBe('v1');
    });

    it('parses v2 as valid', () => {
      expect(parseApiVersion('v2')).toBe('v2');
    });

    it('returns null for v3 (unsupported)', () => {
      expect(parseApiVersion('v3')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(parseApiVersion('')).toBeNull();
    });

    it('returns null for random string', () => {
      expect(parseApiVersion('latest')).toBeNull();
    });

    it('trims and lowercases input', () => {
      expect(parseApiVersion('  V1  ')).toBe('v1');
      expect(parseApiVersion(' V2 ')).toBe('v2');
    });
  });

  describe('isSupported', () => {
    it('returns true for supported versions', () => {
      expect(isSupported('v1')).toBe(true);
      expect(isSupported('v2')).toBe(true);
    });

    it('returns false for unsupported versions', () => {
      expect(isSupported('v99')).toBe(false);
      expect(isSupported('')).toBe(false);
    });
  });

  describe('getVersionFromHeaders', () => {
    it('extracts version from headers when present', () => {
      const headers = { [API_VERSION_HEADER]: 'v2' };
      expect(getVersionFromHeaders(headers)).toBe('v2');
    });

    it('returns null when header is missing', () => {
      expect(getVersionFromHeaders({})).toBeNull();
    });

    it('returns null when header value is undefined', () => {
      const headers = { [API_VERSION_HEADER]: undefined };
      expect(getVersionFromHeaders(headers)).toBeNull();
    });

    it('returns null when header has invalid version', () => {
      const headers = { [API_VERSION_HEADER]: 'v99' };
      expect(getVersionFromHeaders(headers)).toBeNull();
    });
  });

  describe('negotiateVersion', () => {
    it('picks highest mutual version (v2 over v1)', () => {
      const result = negotiateVersion(['v1', 'v2']);
      expect(result).toBe('v2');
    });

    it('falls back to v1 when no client versions overlap', () => {
      const result = negotiateVersion(['v99']);
      expect(result).toBe('v1');
    });

    it('falls back to v1 for empty client versions', () => {
      const result = negotiateVersion([]);
      expect(result).toBe('v1');
    });

    it('filters out invalid client versions and picks valid one', () => {
      const result = negotiateVersion(['invalid', 'v1']);
      expect(result).toBe('v1');
    });

    it('CURRENT_API_VERSION constant is v2', () => {
      expect(CURRENT_API_VERSION).toBe('v2');
    });
  });
});
