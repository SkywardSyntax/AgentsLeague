import { describe, it, expect } from 'vitest';
import { sanitizeSvg } from '@/lib/sanitize-svg';

describe('sanitizeSvg', () => {
  it('passes clean SVG through unchanged', () => {
    const clean = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0L10 10"/></svg>';
    expect(sanitizeSvg(clean)).toBe(clean);
  });

  it('strips <script> tags', () => {
    const input = '<svg><script>alert("xss")</script><path d="M0 0"/></svg>';
    const result = sanitizeSvg(input);
    expect(result).toContain('<path');
    expect(result).not.toContain('<script');
    expect(result).not.toContain('alert');
  });

  it('removes onload attribute', () => {
    const input = '<svg onload="alert(1)"><rect width="10" height="10"/></svg>';
    const result = sanitizeSvg(input);
    expect(result).toContain('<rect');
    expect(result).not.toMatch(/onload/i);
  });

  it('removes onerror attribute', () => {
    const input = '<svg><image onerror="alert(1)" href="x.png"/></svg>';
    const result = sanitizeSvg(input);
    expect(result).not.toMatch(/onerror/i);
  });

  it('strips <foreignObject> elements', () => {
    const input =
      '<svg><foreignObject><body><div>HTML injection</div></body></foreignObject><circle r="5"/></svg>';
    const result = sanitizeSvg(input);
    expect(result).toContain('<circle');
    expect(result).not.toContain('<foreignObject');
    expect(result).not.toContain('<div>');
  });

  it('removes javascript: in href', () => {
    const input = '<svg><a href="javascript:alert(1)"><text>Click</text></a></svg>';
    const result = sanitizeSvg(input);
    expect(result).not.toMatch(/javascript\s*:/i);
  });

  it('cleans xlink:href with javascript protocol', () => {
    const input = '<svg><use xlink:href="javascript:alert(1)"/></svg>';
    const result = sanitizeSvg(input);
    expect(result).not.toMatch(/javascript\s*:/i);
  });

  it('removes multiple event handlers on one element', () => {
    const input = '<svg onclick="a()" onmouseover="b()" onfocus="c()"><rect/></svg>';
    const result = sanitizeSvg(input);
    expect(result).not.toMatch(/onclick/i);
    expect(result).not.toMatch(/onmouseover/i);
    expect(result).not.toMatch(/onfocus/i);
  });

  it('preserves valid MathJax SVG structure', () => {
    const mathjaxSvg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -750 1000 1000" style="width:2em">' +
      '<g stroke="currentColor" fill="currentColor">' +
      '<path d="M0 0L10 10"/>' +
      '<use href="#MJX-1"/>' +
      '</g></svg>';
    const result = sanitizeSvg(mathjaxSvg);
    expect(result).toContain('<g');
    expect(result).toContain('<path');
    expect(result).toContain('<use');
    expect(result).toContain('viewBox');
    expect(result).toContain('style=');
    expect(result).toBe(mathjaxSvg);
  });

  it('returns empty string for empty/null input', () => {
    expect(sanitizeSvg('')).toBe('');
    expect(sanitizeSvg(undefined as any)).toBe('');
  });
});
