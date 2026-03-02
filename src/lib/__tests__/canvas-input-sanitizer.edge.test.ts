import { describe, expect, it } from 'vitest';
import {
  sanitizePasteText,
  validateFileDrop,
  sanitizeClipboardHtml,
} from '@/lib/whiteboard/canvas-input-sanitizer';

describe('canvas-input-sanitizer edge cases', () => {
  describe('sanitizePasteText', () => {
    it('returns empty string and warning for non-string input (number)', () => {
      const result = sanitizePasteText(42);
      expect(result.value).toBe('');
      expect(result.sanitized).toBe(true);
      expect(result.warnings).toContain('Input was not a string');
    });

    it('returns empty string for null input', () => {
      const result = sanitizePasteText(null);
      expect(result.value).toBe('');
      expect(result.sanitized).toBe(true);
    });

    it('strips null bytes and reports warning', () => {
      const result = sanitizePasteText('hello\0world\0');
      expect(result.value).toBe('helloworld');
      expect(result.sanitized).toBe(true);
      expect(result.warnings).toContain('Null bytes removed');
    });

    it('strips control characters (0x01-0x08, 0x0E-0x1F, 0x7F)', () => {
      const result = sanitizePasteText('ab\x01cd\x7Fef');
      expect(result.value).toBe('abcdef');
      expect(result.sanitized).toBe(true);
      expect(result.warnings).toContain('Control characters removed');
    });

    it('strips HTML tags but keeps surrounding text', () => {
      const result = sanitizePasteText('before<script>alert("xss")</script>after');
      expect(result.value).not.toContain('<script>');
      expect(result.value).toContain('before');
      expect(result.value).toContain('after');
      expect(result.sanitized).toBe(true);
    });

    it('truncates text exceeding 50000 characters', () => {
      const longText = 'x'.repeat(60_000);
      const result = sanitizePasteText(longText);
      expect(result.value.length).toBe(50_000);
      expect(result.sanitized).toBe(true);
      expect(result.warnings.some(w => w.includes('Truncated'))).toBe(true);
    });

    it('passes through clean text without sanitizing', () => {
      const result = sanitizePasteText('Hello, world!');
      expect(result.value).toBe('Hello, world!');
      expect(result.sanitized).toBe(false);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('validateFileDrop', () => {
    it('blocks dangerous extension .exe', () => {
      const result = validateFileDrop('malware.exe', 'application/octet-stream', 100);
      expect(result.value.fileName).toBe('');
      expect(result.sanitized).toBe(true);
      expect(result.warnings[0]).toContain('Blocked dangerous file extension');
    });

    it('blocks dangerous extension .ps1', () => {
      const result = validateFileDrop('script.ps1', 'text/plain', 100);
      expect(result.sanitized).toBe(true);
      expect(result.warnings[0]).toContain('.ps1');
    });

    it('rejects disallowed MIME type', () => {
      const result = validateFileDrop('file.doc', 'application/msword', 100);
      expect(result.value.fileName).toBe('');
      expect(result.warnings[0]).toContain('Disallowed MIME type');
    });

    it('rejects file exceeding max size', () => {
      const result = validateFileDrop('big.png', 'image/png', 20 * 1024 * 1024);
      expect(result.value.fileName).toBe('');
      expect(result.warnings[0]).toContain('exceeds limit');
    });

    it('sanitizes filename with null bytes and control chars', () => {
      const result = validateFileDrop('te\0st\x01.png', 'image/png', 100);
      expect(result.value.fileName).toBe('test.png');
      expect(result.sanitized).toBe(true);
    });

    it('accepts valid image file', () => {
      const result = validateFileDrop('photo.png', 'image/png', 1024);
      expect(result.value.fileName).toBe('photo.png');
      expect(result.value.mimeType).toBe('image/png');
    });
  });

  describe('sanitizeClipboardHtml', () => {
    it('returns empty string for non-string input', () => {
      const result = sanitizeClipboardHtml(12345);
      expect(result.value).toBe('');
      expect(result.sanitized).toBe(true);
    });

    it('removes script tags and their contents', () => {
      const result = sanitizeClipboardHtml('<p>safe</p><script>alert(1)</script>');
      expect(result.value).not.toContain('script');
      expect(result.value).toContain('safe');
    });

    it('removes event handler attributes', () => {
      const result = sanitizeClipboardHtml('<div onclick="hack()">text</div>');
      expect(result.value).not.toContain('onclick');
    });
  });
});
