import { describe, it, expect } from 'vitest';
import { z } from 'zod';

const LatexSvgRequestSchema = z.object({
  tex: z.string().min(1).max(10_000, 'TeX input exceeds maximum length of 10,000 characters'),
  displayMode: z.boolean().optional(),
});

describe('LatexSvgRequestSchema max-length validation', () => {
  it('rejects TeX string longer than 10,000 characters', () => {
    const result = LatexSvgRequestSchema.safeParse({ tex: 'x'.repeat(10_001) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        'TeX input exceeds maximum length of 10,000 characters',
      );
    }
  });

  it('accepts TeX string of exactly 10,000 characters', () => {
    const result = LatexSvgRequestSchema.safeParse({ tex: 'x'.repeat(10_000) });
    expect(result.success).toBe(true);
  });

  it('accepts TeX string of length 1 (minimum boundary)', () => {
    const result = LatexSvgRequestSchema.safeParse({ tex: 'x' });
    expect(result.success).toBe(true);
  });

  it('rejects empty string with min validation error', () => {
    const result = LatexSvgRequestSchema.safeParse({ tex: '' });
    expect(result.success).toBe(false);
  });
});
