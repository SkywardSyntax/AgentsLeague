import { describe, it, expect } from 'vitest';
import {
  detectSqlInjection,
  detectPathTraversal,
  detectOpenRedirect,
  detectHeaderInjection,
  detectCommandInjection,
  validateInput,
  sanitizePath,
} from '../owasp-validators';

describe('owasp-validators', () => {
  describe('detectSqlInjection', () => {
    it('detects classic OR injection', () => {
      const result = detectSqlInjection("' OR '1'='1");
      expect(result.safe).toBe(false);
    });

    it('detects UNION SELECT', () => {
      const result = detectSqlInjection('1 UNION SELECT * FROM users');
      expect(result.safe).toBe(false);
    });

    it('detects comment-based injection', () => {
      const result = detectSqlInjection("admin'; --");
      expect(result.safe).toBe(false);
    });

    it('passes clean input', () => {
      const result = detectSqlInjection('John Doe');
      expect(result.safe).toBe(true);
    });

    it('detects SLEEP-based blind injection', () => {
      const result = detectSqlInjection("1; SELECT SLEEP(5)");
      expect(result.safe).toBe(false);
    });
  });

  describe('detectPathTraversal', () => {
    it('detects ../ traversal', () => {
      expect(detectPathTraversal('../etc/passwd').safe).toBe(false);
    });

    it('detects encoded traversal', () => {
      expect(detectPathTraversal('..%2Fetc%2Fpasswd').safe).toBe(false);
    });

    it('passes clean paths', () => {
      expect(detectPathTraversal('images/photo.png').safe).toBe(true);
    });
  });

  describe('detectOpenRedirect', () => {
    it('detects protocol-relative URLs', () => {
      expect(detectOpenRedirect('//evil.com').safe).toBe(false);
    });

    it('detects absolute URLs with protocol', () => {
      expect(detectOpenRedirect('https://evil.com').safe).toBe(false);
    });

    it('allows relative paths', () => {
      expect(detectOpenRedirect('/dashboard').safe).toBe(true);
    });
  });

  describe('detectHeaderInjection', () => {
    it('detects CRLF injection', () => {
      expect(detectHeaderInjection('value\r\nX-Injected: true').safe).toBe(false);
    });

    it('passes clean values', () => {
      expect(detectHeaderInjection('clean-header-value').safe).toBe(true);
    });
  });

  describe('detectCommandInjection', () => {
    it('detects semicolon injection', () => {
      expect(detectCommandInjection('file; rm -rf /').safe).toBe(false);
    });

    it('detects backtick injection', () => {
      expect(detectCommandInjection('`whoami`').safe).toBe(false);
    });

    it('detects $() injection', () => {
      expect(detectCommandInjection('$(cat /etc/passwd)').safe).toBe(false);
    });

    it('detects pipe injection', () => {
      expect(detectCommandInjection('file | cat /etc/passwd').safe).toBe(false);
    });
  });

  describe('validateInput', () => {
    it('runs all checks by default', () => {
      const result = validateInput("' OR '1'='1");
      expect(result.safe).toBe(false);
      expect(result.threats).toContain('sql_injection');
    });

    it('runs only specified checks', () => {
      const result = validateInput('../etc/passwd', ['path']);
      expect(result.safe).toBe(false);
      expect(result.threats).toContain('path_traversal');
    });
  });

  describe('sanitizePath', () => {
    it('removes traversal sequences', () => {
      expect(sanitizePath('../../etc/passwd')).toBe('etc/passwd');
    });

    it('preserves clean paths', () => {
      expect(sanitizePath('images/photo.png')).toBe('images/photo.png');
    });
  });
});
