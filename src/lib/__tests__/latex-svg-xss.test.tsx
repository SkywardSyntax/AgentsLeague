import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';

vi.mock('@/lib/latex/mathjax-client', () => ({
  renderTexToSvg: vi.fn(),
  getCachedSvg: vi.fn(() => undefined),
}));

import { LatexSvg } from '@/components/chat/LatexSvg';
import { renderTexToSvg } from '@/lib/latex/mathjax-client';

const mockRender = renderTexToSvg as ReturnType<typeof vi.fn>;

afterEach(cleanup);

describe('LatexSvg XSS attack surface', () => {
  beforeEach(() => {
    mockRender.mockReset();
  });

  it('sanitizer strips embedded <script> tags from SVG', async () => {
    mockRender.mockResolvedValue('<svg><script>alert("xss")</script></svg>');
    const { container } = render(<LatexSvg tex="xss_script_test" displayMode={false} />);
    await waitFor(() => expect(container.querySelector('svg')).toBeTruthy());
    // The sanitizer removes <script> elements from SVG output
    const script = container.querySelector('script');
    expect(script).toBeNull();
  });

  it('sanitizer strips SVG onload event handlers', async () => {
    const malicious = '<svg onload="alert(1)"><rect width="10" height="10"/></svg>';
    mockRender.mockResolvedValue(malicious);
    const { container } = render(<LatexSvg tex="xss_onload_test" displayMode={false} />);
    await waitFor(() => expect(container.querySelector('svg')).toBeTruthy());
    // The sanitizer removes on* event handler attributes
    const span = container.querySelector('[role="math"]')!;
    expect(span.innerHTML).not.toContain('onload');
  });

  it('sanitizer strips <foreignObject> with HTML from SVG', async () => {
    const malicious =
      '<svg><foreignObject><body xmlns="http://www.w3.org/1999/xhtml"><img src=x onerror="alert(1)"/></body></foreignObject></svg>';
    mockRender.mockResolvedValue(malicious);
    const { container } = render(<LatexSvg tex="xss_foreignobject_test" displayMode={false} />);
    // Wait for render to complete
    await waitFor(() => {
      const mathEl = container.querySelector('[role="math"]');
      expect(mathEl).toBeTruthy();
    });
    // The sanitizer removes <foreignObject> elements
    const span = container.querySelector('[role="math"]')!;
    expect(span.innerHTML).not.toContain('foreignObject');
    expect(span.innerHTML).not.toContain('onerror');
  });

  it('clean MathJax-style SVG contains no dangerous elements', async () => {
    const cleanSvg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><g><path d="M10 20 L90 20"/></g></svg>';
    mockRender.mockResolvedValue(cleanSvg);
    const { container } = render(<LatexSvg tex="xss_clean_test" displayMode={false} />);
    await waitFor(() => expect(container.querySelector('svg')).toBeTruthy());
    const span = container.querySelector('[role="math"]')!;
    expect(span.innerHTML).not.toContain('<script');
    expect(span.innerHTML).not.toContain('onload');
    expect(span.innerHTML).not.toContain('foreignObject');
  });
});
