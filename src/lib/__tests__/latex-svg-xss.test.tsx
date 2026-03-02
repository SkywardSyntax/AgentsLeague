import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';

vi.mock('@/lib/latex/mathjax-client', () => ({
  renderTexToSvg: vi.fn(),
}));

import { LatexSvg } from '@/components/chat/LatexSvg';
import { renderTexToSvg } from '@/lib/latex/mathjax-client';

const mockRender = renderTexToSvg as ReturnType<typeof vi.fn>;

afterEach(cleanup);

describe('LatexSvg XSS attack surface', () => {
  beforeEach(() => {
    mockRender.mockReset();
  });

  it('documents that embedded <script> tags survive dangerouslySetInnerHTML', async () => {
    mockRender.mockResolvedValue('<svg><script>alert("xss")</script></svg>');
    const { container } = render(<LatexSvg tex="xss_script_test" displayMode={false} />);
    await waitFor(() => expect(container.querySelector('svg')).toBeTruthy());
    // innerHTML-inserted <script> tags don't execute in browsers, but their
    // presence in the DOM is a concern for defense-in-depth.
    // jsdom parses inline <script> inside SVG — the element IS present.
    const script = container.querySelector('script');
    expect(script).not.toBeNull();
  });

  it('documents that SVG onload event handlers survive dangerouslySetInnerHTML', async () => {
    const malicious = '<svg onload="alert(1)"><rect width="10" height="10"/></svg>';
    mockRender.mockResolvedValue(malicious);
    const { container } = render(<LatexSvg tex="xss_onload_test" displayMode={false} />);
    await waitFor(() => expect(container.querySelector('svg')).toBeTruthy());
    // dangerouslySetInnerHTML renders the string as-is into the span's innerHTML.
    // The outer <span> innerHTML is the raw SVG string — verify the raw HTML
    // contains the onload handler even if jsdom's parsed DOM strips it.
    const span = container.querySelector('[role="img"]')!;
    expect(span.innerHTML).toContain('onload');
  });

  it('documents that <foreignObject> with HTML survives dangerouslySetInnerHTML', async () => {
    const malicious =
      '<svg><foreignObject><body xmlns="http://www.w3.org/1999/xhtml"><img src=x onerror="alert(1)"/></body></foreignObject></svg>';
    mockRender.mockResolvedValue(malicious);
    const { container } = render(<LatexSvg tex="xss_foreignobject_test" displayMode={false} />);
    await waitFor(() => expect(container.querySelector('svg')).toBeTruthy());
    // Verify the raw innerHTML contains the foreignObject payload
    const span = container.querySelector('[role="img"]')!;
    expect(span.innerHTML).toContain('foreignObject');
  });

  it('clean MathJax-style SVG contains no dangerous elements', async () => {
    const cleanSvg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><g><path d="M10 20 L90 20"/></g></svg>';
    mockRender.mockResolvedValue(cleanSvg);
    const { container } = render(<LatexSvg tex="xss_clean_test" displayMode={false} />);
    await waitFor(() => expect(container.querySelector('svg')).toBeTruthy());
    const span = container.querySelector('[role="img"]')!;
    expect(span.innerHTML).not.toContain('<script');
    expect(span.innerHTML).not.toContain('onload');
    expect(span.innerHTML).not.toContain('foreignObject');
  });
});
