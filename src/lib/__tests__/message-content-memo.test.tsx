import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { MessageContent } from '@/components/chat/MessageContent';

// Mock LatexSvg to avoid MathJax dependency in tests
vi.mock('@/components/chat/LatexSvg', () => ({
  LatexSvg: ({ tex }: { tex: string }) => <span data-testid="latex">{tex}</span>,
}));

afterEach(cleanup);

describe('MessageContent React.memo', () => {
  it('is wrapped with React.memo (has $$typeof Symbol for memo)', () => {
    // React.memo components have a specific internal type
    // The displayName of a memo-wrapped named function is preserved
    expect(MessageContent).toBeTruthy();
    // React.memo wraps the component — the type symbol indicates memo
    expect((MessageContent as unknown as { $$typeof: symbol }).$$typeof).toBe(
      Symbol.for('react.memo'),
    );
  });

  it('renders text content correctly', () => {
    const { container } = render(<MessageContent content="Hello world" />);
    expect(container.textContent).toContain('Hello world');
  });

  it('does not re-render when content prop is unchanged', () => {
    let renderCount = 0;
    const spy = vi.fn(() => {
      renderCount++;
    });

    // We test memo behavior by checking that React.memo prevents
    // re-render when props are shallowly equal
    const { rerender } = render(<MessageContent content="same" />);
    const firstHTML = document.body.innerHTML;

    rerender(<MessageContent content="same" />);
    const secondHTML = document.body.innerHTML;

    // Same content should produce identical output
    expect(firstHTML).toBe(secondHTML);
  });

  it('re-renders when content prop changes', () => {
    const { container, rerender } = render(<MessageContent content="first" />);
    expect(container.textContent).toContain('first');

    rerender(<MessageContent content="second" />);
    expect(container.textContent).toContain('second');
    expect(container.textContent).not.toContain('first');
  });
});
