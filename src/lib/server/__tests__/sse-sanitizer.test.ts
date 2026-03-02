import { describe, it, expect } from 'vitest';
import {
  validateEventName,
  sanitizeDataField,
  sanitizeFieldValue,
  formatSafeSSE,
  isAllowedEventName,
  detectHeaderInjection,
} from '../sse-sanitizer';

describe('sse-sanitizer', () => {
  describe('validateEventName', () => {
    it('accepts valid event names', () => {
      expect(validateEventName('message').valid).toBe(true);
      expect(validateEventName('assistant.text.delta').valid).toBe(true);
      expect(validateEventName('ping').valid).toBe(true);
    });

    it('rejects empty event names', () => {
      expect(validateEventName('').valid).toBe(false);
    });

    it('rejects event names with CRLF', () => {
      const result = validateEventName('message\r\nInjected: header');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('CRLF'))).toBe(true);
    });

    it('rejects event names not in allowlist', () => {
      const result = validateEventName('evil.custom.event');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('allowlist'))).toBe(true);
    });

    it('rejects event names with invalid characters', () => {
      const result = validateEventName('event<script>');
      expect(result.valid).toBe(false);
    });
  });

  describe('sanitizeDataField', () => {
    it('passes through valid strings', () => {
      const result = sanitizeDataField('hello world');
      expect(result.value).toBe('hello world');
      expect(result.sanitized).toBe(false);
    });

    it('serializes objects to JSON', () => {
      const result = sanitizeDataField({ key: 'value' });
      expect(result.value).toBe('{"key":"value"}');
    });

    it('strips null bytes', () => {
      const result = sanitizeDataField('abc\0def');
      expect(result.value).toBe('abcdef');
      expect(result.sanitized).toBe(true);
    });

    it('truncates oversized data', () => {
      const result = sanitizeDataField('x'.repeat(2_000_000));
      expect(result.value.length).toBe(1_048_576);
      expect(result.sanitized).toBe(true);
    });

    it('handles null/undefined', () => {
      expect(sanitizeDataField(null).value).toBe('');
      expect(sanitizeDataField(undefined).value).toBe('');
    });
  });

  describe('sanitizeFieldValue', () => {
    it('strips CRLF characters', () => {
      const result = sanitizeFieldValue('header', 'value\r\nInjected');
      expect(result).not.toContain('\r');
      expect(result).not.toContain('\n');
    });
  });

  describe('formatSafeSSE', () => {
    it('formats valid SSE output', () => {
      const result = formatSafeSSE('message', { text: 'hello' });
      expect(result.errors).toHaveLength(0);
      expect(result.output).toContain('event: message');
      expect(result.output).toContain('data: ');
    });

    it('rejects invalid event names', () => {
      const result = formatSafeSSE('evil\r\nheader', 'data');
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.output).toBe('');
    });
  });

  describe('isAllowedEventName', () => {
    it('returns true for allowed events', () => {
      expect(isAllowedEventName('message')).toBe(true);
      expect(isAllowedEventName('heartbeat')).toBe(true);
    });

    it('returns false for disallowed events', () => {
      expect(isAllowedEventName('unknown.event')).toBe(false);
    });
  });

  describe('detectHeaderInjection', () => {
    it('detects CRLF injection', () => {
      expect(detectHeaderInjection('value\r\nX-Injected: true')).toBe(true);
    });

    it('detects null byte injection', () => {
      expect(detectHeaderInjection('value\0extra')).toBe(true);
    });

    it('passes clean values', () => {
      expect(detectHeaderInjection('clean-value')).toBe(false);
    });
  });
});
