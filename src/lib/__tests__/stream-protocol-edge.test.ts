import { describe, expect, it } from 'vitest';
import {
  parseProtocolVersion,
  isCompatible,
  supportsFeature,
  protocolHeader,
  negotiateProtocol,
  CURRENT_PROTOCOL_VERSION,
  PROTOCOL_VERSION_HEADER,
} from '@/lib/server/stream-protocol';

describe('stream-protocol edge cases', () => {
  describe('parseProtocolVersion', () => {
    it('parses valid semver string', () => {
      const v = parseProtocolVersion('1.2.0');
      expect(v).toEqual({ major: 1, minor: 2, patch: 0 });
    });

    it('returns null for empty string', () => {
      expect(parseProtocolVersion('')).toBeNull();
    });

    it('returns null for alpha-only string', () => {
      expect(parseProtocolVersion('abc')).toBeNull();
    });

    it('returns null for partial version (missing patch)', () => {
      expect(parseProtocolVersion('1.2')).toBeNull();
    });

    it('parses version with large numbers', () => {
      const v = parseProtocolVersion('99.88.77');
      expect(v).toEqual({ major: 99, minor: 88, patch: 77 });
    });
  });

  describe('isCompatible', () => {
    it('returns true when major versions match', () => {
      expect(isCompatible('1.0.0', '1.9.9')).toBe(true);
    });

    it('returns false when major versions differ', () => {
      expect(isCompatible('1.0.0', '2.0.0')).toBe(false);
    });

    it('returns false when either version is invalid', () => {
      expect(isCompatible('bad', '1.0.0')).toBe(false);
      expect(isCompatible('1.0.0', 'bad')).toBe(false);
    });
  });

  describe('supportsFeature', () => {
    it('returns true for known features', () => {
      expect(supportsFeature('assistant.text.delta')).toBe(true);
      expect(supportsFeature('assistant.error')).toBe(true);
    });

    it('returns false for unknown feature', () => {
      expect(supportsFeature('assistant.unknown.action')).toBe(false);
    });
  });

  describe('protocolHeader', () => {
    it('returns the correct header name and current version value', () => {
      const header = protocolHeader();
      expect(header.name).toBe(PROTOCOL_VERSION_HEADER);
      expect(header.value).toBe(CURRENT_PROTOCOL_VERSION);
    });
  });

  describe('negotiateProtocol', () => {
    it('returns highest compatible version', () => {
      const result = negotiateProtocol(['1.0.0', '1.2.0'], ['1.2.0', '2.0.0']);
      expect(result).toBe('1.2.0');
    });

    it('returns null when no versions overlap', () => {
      const result = negotiateProtocol(['1.0.0'], ['2.0.0']);
      expect(result).toBeNull();
    });

    it('returns null for empty client versions', () => {
      expect(negotiateProtocol([], ['1.0.0'])).toBeNull();
    });

    it('filters out invalid client version strings', () => {
      const result = negotiateProtocol(['bad', '1.0.0'], ['1.0.0']);
      expect(result).toBe('1.0.0');
    });

    it('prefers higher version when multiple match', () => {
      const result = negotiateProtocol(['1.0.0', '1.3.0', '1.1.0'], ['1.0.0', '1.3.0']);
      expect(result).toBe('1.3.0');
    });
  });
});
