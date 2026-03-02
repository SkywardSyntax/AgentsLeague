import { describe, expect, it } from 'vitest';
import { sanitizeSvg } from '@/components/chat/LatexSvg';

describe('sanitizeSvg (DOM-based)', () => {
  it('passes clean SVG through unchanged', () => {
    const clean = '<svg xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="10" height="10"/></svg>';
    const result = sanitizeSvg(clean);
    expect(result).toContain('<rect');
    expect(result).toContain('width="10"');
  });

  it('removes <script> elements', () => {
    const evil = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect width="10" height="10"/></svg>';
    const result = sanitizeSvg(evil);
    expect(result).not.toContain('script');
    expect(result).not.toContain('alert');
    expect(result).toContain('<rect');
  });

  it('removes onerror event handler attribute', () => {
    const evil = '<svg xmlns="http://www.w3.org/2000/svg"><rect onerror="alert(1)" width="10" height="10"/></svg>';
    const result = sanitizeSvg(evil);
    expect(result).not.toContain('onerror');
    expect(result).not.toContain('alert');
    expect(result).toContain('<rect');
  });

  it('removes xlink:href with javascript: URI', () => {
    const evil = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><a xlink:href="javascript:alert(1)"><text>click</text></a></svg>';
    const result = sanitizeSvg(evil);
    expect(result).not.toContain('javascript:');
  });

  it('removes <animate> with onbegin handler', () => {
    const evil = '<svg xmlns="http://www.w3.org/2000/svg"><animate onbegin="alert(1)" attributeName="x" from="0" to="100"/></svg>';
    const result = sanitizeSvg(evil);
    expect(result).not.toContain('onbegin');
    expect(result).not.toContain('alert');
  });

  it('detects entity-encoded javascript: in href', () => {
    // &#106; = 'j'
    const evil = '<svg xmlns="http://www.w3.org/2000/svg"><a href="&#106;avascript:alert(1)"><text>click</text></a></svg>';
    const result = sanitizeSvg(evil);
    expect(result).not.toContain('alert');
  });

  it('removes <foreignObject> element entirely', () => {
    const evil = '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><body xmlns="http://www.w3.org/1999/xhtml"><div>pwned</div></body></foreignObject></svg>';
    const result = sanitizeSvg(evil);
    expect(result).not.toContain('foreignObject');
    expect(result).not.toContain('pwned');
  });

  it('returns empty string for malformed SVG (parsererror)', () => {
    const malformed = '<svg xmlns="http://www.w3.org/2000/svg"><rect';
    const result = sanitizeSvg(malformed);
    expect(result).toBe('');
  });

  it('removes href with data:text/html URI', () => {
    const evil = '<svg xmlns="http://www.w3.org/2000/svg"><a href="data:text/html,<script>alert(1)</script>"><text>x</text></a></svg>';
    const result = sanitizeSvg(evil);
    expect(result).not.toContain('data:text/html');
  });

  it('handles hex-encoded entity in href', () => {
    // &#x6a; = 'j'
    const evil = '<svg xmlns="http://www.w3.org/2000/svg"><a href="&#x6a;avascript:alert(1)"><text>x</text></a></svg>';
    const result = sanitizeSvg(evil);
    expect(result).not.toContain('alert');
  });

  it('preserves standard MathJax SVG attributes', () => {
    const mathjax = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g transform="translate(10,20)"><path d="M0,0 L10,10" fill="none" stroke="black" stroke-width="1"/></g></svg>';
    const result = sanitizeSvg(mathjax);
    expect(result).toContain('viewBox');
    expect(result).toContain('transform');
    expect(result).toContain('stroke-width');
  });
});
