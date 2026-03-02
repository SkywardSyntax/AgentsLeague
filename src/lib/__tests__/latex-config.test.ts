import { describe, it, expect } from 'vitest';
import { validateLatexConfig, isCommandBlocked, BLOCKED_COMMANDS } from '@/lib/latex/latex-config';

describe('LatexConfigSchema', () => {
  it('accepts a fully valid configuration', () => {
    const config = validateLatexConfig({
      allowedPackages: ['ams', 'base'], maxExpressionLength: 5000,
      maxNestingDepth: 10, outputFormat: 'chtml',
    });
    expect(config.maxExpressionLength).toBe(5000);
    expect(config.outputFormat).toBe('chtml');
  });

  it('applies defaults when fields are omitted', () => {
    const config = validateLatexConfig({});
    expect(config.allowedPackages).toEqual(['ams', 'base', 'boldsymbol']);
    expect(config.maxExpressionLength).toBe(10000);
    expect(config.maxNestingDepth).toBe(20);
    expect(config.outputFormat).toBe('svg');
  });

  it('blocks dangerous commands via isCommandBlocked', () => {
    const config = validateLatexConfig({});
    expect(isCommandBlocked('\\input', config)).toBe(true);
    expect(isCommandBlocked('\\input{file.tex}', config)).toBe(true);
    expect(isCommandBlocked('\\write', config)).toBe(true);
  });

  it('allows safe commands', () => {
    const config = validateLatexConfig({});
    expect(isCommandBlocked('\\frac', config)).toBe(false);
    expect(isCommandBlocked('\\sqrt', config)).toBe(false);
  });

  it('rejects expression length exceeding max', () => {
    expect(() => validateLatexConfig({ maxExpressionLength: 50001 })).toThrow();
  });

  it('rejects nesting depth exceeding max', () => {
    expect(() => validateLatexConfig({ maxNestingDepth: 101 })).toThrow();
  });

  it('rejects invalid output format', () => {
    expect(() => validateLatexConfig({ outputFormat: 'pdf' })).toThrow();
  });

  it('populates default blocked commands list', () => {
    const config = validateLatexConfig({});
    expect(config.blockedCommands.length).toBeGreaterThan(0);
    expect(config.blockedCommands).toContain('\\input');
    expect(config.blockedCommands).toContain('\\catcode');
  });

  it('allows empty packages array', () => {
    const config = validateLatexConfig({ allowedPackages: [] });
    expect(config.allowedPackages).toEqual([]);
  });

  it('validates max expression length at boundary', () => {
    const config = validateLatexConfig({ maxExpressionLength: 50000 });
    expect(config.maxExpressionLength).toBe(50000);
    const config2 = validateLatexConfig({ maxExpressionLength: 1 });
    expect(config2.maxExpressionLength).toBe(1);
  });
});
