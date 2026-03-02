import { describe, it, expect } from 'vitest';
import {
  isCommandAllowed,
  isCommandDangerous,
  validateLatexCommands,
  checkNestingDepth,
  sanitizeLatex,
} from '../command-allowlist';

describe('command-allowlist', () => {
  describe('isCommandAllowed', () => {
    it('allows safe math commands', () => {
      expect(isCommandAllowed('frac')).toBe(true);
      expect(isCommandAllowed('sqrt')).toBe(true);
      expect(isCommandAllowed('sum')).toBe(true);
      expect(isCommandAllowed('alpha')).toBe(true);
    });

    it('rejects unknown commands', () => {
      expect(isCommandAllowed('randomcommand')).toBe(false);
    });
  });

  describe('isCommandDangerous', () => {
    it('flags dangerous commands', () => {
      expect(isCommandDangerous('input')).toBe(true);
      expect(isCommandDangerous('write')).toBe(true);
      expect(isCommandDangerous('catcode')).toBe(true);
      expect(isCommandDangerous('def')).toBe(true);
      expect(isCommandDangerous('directlua')).toBe(true);
    });

    it('does not flag safe commands', () => {
      expect(isCommandDangerous('frac')).toBe(false);
      expect(isCommandDangerous('sin')).toBe(false);
    });
  });

  describe('validateLatexCommands', () => {
    it('validates safe LaTeX expressions', () => {
      const result = validateLatexCommands('\\frac{1}{2} + \\sqrt{3}');
      expect(result.safe).toBe(true);
      expect(result.blocked).toHaveLength(0);
    });

    it('blocks dangerous commands', () => {
      const result = validateLatexCommands('\\input{/etc/passwd}');
      expect(result.safe).toBe(false);
      expect(result.blocked).toContain('input');
    });

    it('reports unknown commands separately', () => {
      const result = validateLatexCommands('\\frac{1}{2} + \\myCustomCmd{x}');
      expect(result.safe).toBe(true);
      expect(result.unknown).toContain('myCustomCmd');
    });

    it('blocks multiple dangerous commands', () => {
      const result = validateLatexCommands('\\input{file} \\write{data} \\catcode');
      expect(result.safe).toBe(false);
      expect(result.blocked.length).toBe(3);
    });

    it('handles non-string input', () => {
      const result = validateLatexCommands(null as unknown as string);
      expect(result.safe).toBe(true);
    });

    it('blocks overly long command names', () => {
      const longCmd = 'a'.repeat(60);
      const result = validateLatexCommands(`\\${longCmd}{x}`);
      expect(result.safe).toBe(false);
      expect(result.blocked).toContain(longCmd);
    });
  });

  describe('checkNestingDepth', () => {
    it('accepts reasonable nesting', () => {
      const result = checkNestingDepth('\\frac{\\frac{1}{2}}{3}');
      expect(result.safe).toBe(true);
      expect(result.depth).toBeGreaterThan(0);
    });

    it('rejects excessive nesting', () => {
      const deep = '{'.repeat(25) + 'x' + '}'.repeat(25);
      const result = checkNestingDepth(deep);
      expect(result.safe).toBe(false);
      expect(result.depth).toBe(25);
    });
  });

  describe('sanitizeLatex', () => {
    it('replaces dangerous commands with blocked text', () => {
      const result = sanitizeLatex('\\input{/etc/passwd}');
      expect(result).toContain('[blocked: input]');
      expect(result).not.toMatch(/\\input\b/);
    });

    it('preserves safe commands', () => {
      const result = sanitizeLatex('\\frac{1}{2}');
      expect(result).toBe('\\frac{1}{2}');
    });
  });
});
