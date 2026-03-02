import { describe, it, expect } from 'vitest';
import {
  sanitizePasteText,
  validateFileDrop,
  sanitizeClipboardHtml,
} from '../canvas-input-sanitizer';

describe('canvas-input-sanitizer', () => {
  describe('sanitizePasteText', () => {
    it('passes through clean text unchanged', () => {
      const result = sanitizePasteText('Hello, world!');
      expect(result.value).toBe('Hello, world!');
      expect(result.sanitized).toBe(false);
      expect(result.warnings).toHaveLength(0);
    });

    it('strips null bytes', () => {
      const result = sanitizePasteText('abc\0def\0ghi');
      expect(result.value).toBe('abcdefghi');
      expect(result.sanitized).toBe(true);
      expect(result.warnings).toContain('Null bytes removed');
    });

    it('strips control characters', () => {
      const result = sanitizePasteText('abc\x01\x02\x03def');
      expect(result.value).toBe('abcdef');
      expect(result.sanitized).toBe(true);
    });

    it('strips HTML tags', () => {
      const result = sanitizePasteText('<script>alert(1)</script>hello');
      expect(result.value).not.toContain('<script>');
      expect(result.value).toContain('alert(1)');
      expect(result.sanitized).toBe(true);
    });

    it('truncates oversized input', () => {
      const long = 'x'.repeat(100_000);
      const result = sanitizePasteText(long);
      expect(result.value.length).toBe(50_000);
      expect(result.sanitized).toBe(true);
    });

    it('returns empty for non-string input', () => {
      const result = sanitizePasteText(12345);
      expect(result.value).toBe('');
      expect(result.sanitized).toBe(true);
    });
  });

  describe('validateFileDrop', () => {
    it('accepts valid image files', () => {
      const result = validateFileDrop('photo.png', 'image/png', 1024);
      expect(result.value.fileName).toBe('photo.png');
      expect(result.value.mimeType).toBe('image/png');
    });

    it('blocks dangerous file extensions', () => {
      const result = validateFileDrop('hack.exe', 'application/octet-stream', 1024);
      expect(result.sanitized).toBe(true);
      expect(result.warnings[0]).toContain('Blocked dangerous file extension');
    });

    it('blocks disallowed MIME types', () => {
      const result = validateFileDrop('app.wasm', 'application/wasm', 1024);
      expect(result.sanitized).toBe(true);
      expect(result.warnings[0]).toContain('Disallowed MIME type');
    });

    it('rejects oversized files', () => {
      const result = validateFileDrop('big.png', 'image/png', 20 * 1024 * 1024);
      expect(result.sanitized).toBe(true);
      expect(result.warnings[0]).toContain('exceeds limit');
    });

    it('strips null bytes from filenames', () => {
      const result = validateFileDrop('file\0name.png', 'image/png', 1024);
      expect(result.value.fileName).toBe('filename.png');
      expect(result.sanitized).toBe(true);
    });
  });

  describe('sanitizeClipboardHtml', () => {
    it('strips script tags and contents', () => {
      const result = sanitizeClipboardHtml('<p>hello</p><script>alert(1)</script>');
      expect(result.value).not.toContain('script');
      expect(result.value).toContain('hello');
    });

    it('strips event handler attributes', () => {
      const result = sanitizeClipboardHtml('<div onmouseover="alert(1)">text</div>');
      expect(result.value).not.toContain('onmouseover');
    });

    it('handles non-string input', () => {
      const result = sanitizeClipboardHtml(null);
      expect(result.value).toBe('');
      expect(result.sanitized).toBe(true);
    });
  });
});
