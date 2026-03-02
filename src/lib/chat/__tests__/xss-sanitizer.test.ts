import { describe, it, expect } from 'vitest';
import {
  sanitizeChatHtml,
  escapeHtmlEntities,
  isSafeUrl,
} from '../xss-sanitizer';

describe('xss-sanitizer', () => {
  describe('sanitizeChatHtml', () => {
    it('returns clean text unchanged', () => {
      const result = sanitizeChatHtml('Hello, world!');
      expect(result.clean).toBe('Hello, world!');
      expect(result.threats).toHaveLength(0);
    });

    it('strips script tags', () => {
      const result = sanitizeChatHtml('before<script>alert("xss")</script>after');
      expect(result.clean).not.toContain('<script>');
      expect(result.threats).toContain('script_tag');
    });

    it('strips event handlers', () => {
      const result = sanitizeChatHtml('<img src=x onerror="alert(1)">');
      expect(result.clean).not.toContain('onerror');
      expect(result.threats).toContain('event_handler');
    });

    it('strips javascript: URIs', () => {
      const result = sanitizeChatHtml('<a href="javascript:alert(1)">click</a>');
      expect(result.clean).not.toContain('javascript:');
      expect(result.threats).toContain('javascript_uri');
    });

    it('strips iframe tags', () => {
      const result = sanitizeChatHtml('<iframe src="evil.com"></iframe>');
      expect(result.clean).not.toContain('<iframe');
      expect(result.threats).toContain('iframe');
    });

    it('strips SVG-based XSS', () => {
      const result = sanitizeChatHtml('<svg onload="alert(1)"><circle r="10"/></svg>');
      expect(result.clean).not.toContain('<svg');
      expect(result.threats).toContain('svg_xss');
    });

    it('strips CSS expression', () => {
      const result = sanitizeChatHtml('<div style="width: expression(alert(1))">');
      expect(result.clean).not.toContain('expression(');
      expect(result.threats).toContain('css_expression');
    });

    it('strips vbscript URIs', () => {
      const result = sanitizeChatHtml('<a href="vbscript:msgbox">click</a>');
      expect(result.clean).not.toContain('vbscript:');
      expect(result.threats).toContain('vbscript_uri');
    });

    it('strips object and embed tags', () => {
      const result = sanitizeChatHtml('<object data="evil.swf"></object><embed src="evil.swf">');
      expect(result.clean).not.toContain('<object');
      expect(result.clean).not.toContain('<embed');
    });

    it('handles non-string input', () => {
      const result = sanitizeChatHtml(undefined);
      expect(result.clean).toBe('');
      expect(result.threats).toContain('non-string input');
    });
  });

  describe('escapeHtmlEntities', () => {
    it('escapes all dangerous characters', () => {
      const result = escapeHtmlEntities('<script>"hello" & \'world\'</script>');
      expect(result).not.toContain('<');
      expect(result).not.toContain('>');
      expect(result).toContain('&lt;');
      expect(result).toContain('&gt;');
      expect(result).toContain('&quot;');
      expect(result).toContain('&#x27;');
      expect(result).toContain('&amp;');
    });
  });

  describe('isSafeUrl', () => {
    it('allows regular URLs', () => {
      expect(isSafeUrl('https://example.com')).toBe(true);
      expect(isSafeUrl('/path/to/page')).toBe(true);
    });

    it('blocks javascript: URLs', () => {
      expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    });

    it('blocks vbscript: URLs', () => {
      expect(isSafeUrl('vbscript:msgbox')).toBe(false);
    });

    it('blocks data: URLs (non-image)', () => {
      expect(isSafeUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    });

    it('allows data:image URLs', () => {
      expect(isSafeUrl('data:image/png;base64,abc')).toBe(true);
    });
  });
});
