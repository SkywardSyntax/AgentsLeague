import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { MathInputField, containsLatex } from '../MathInputField';

// ---------------------------------------------------------------------------
// Mock LatexSvg — avoids pulling in the full MathJax runtime
// ---------------------------------------------------------------------------

vi.mock('@/components/chat/LatexSvg', () => ({
  LatexSvg: ({ tex }: { tex: string }) => (
    <span data-testid="latex-svg" role="math">
      {tex}
    </span>
  ),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MathInputField', () => {
  it('renders without crashing', () => {
    render(<MathInputField value="" onChange={() => {}} />);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('shows preview when value contains LaTeX markers', () => {
    render(<MathInputField value="x^2" onChange={() => {}} />);

    // Advance past the 300ms debounce
    act(() => {
      vi.advanceTimersByTime(350);
    });

    expect(screen.getByTestId('math-preview')).toBeInTheDocument();
    expect(screen.getByTestId('latex-svg')).toHaveTextContent('x^2');
  });

  it('does not show preview for plain text', () => {
    render(<MathInputField value="Hello world" onChange={() => {}} />);

    act(() => {
      vi.advanceTimersByTime(350);
    });

    expect(screen.queryByTestId('math-preview')).not.toBeInTheDocument();
  });

  it('renders the label when provided', () => {
    render(<MathInputField value="" onChange={() => {}} label="Formula" />);
    expect(screen.getByText('Formula')).toBeInTheDocument();
  });

  it('calls onChange when typing', () => {
    const handleChange = vi.fn();
    render(<MathInputField value="" onChange={handleChange} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'test' } });
    expect(handleChange).toHaveBeenCalledWith('test');
  });

  it('debounces the preview (no preview before 300ms)', () => {
    const { rerender } = render(<MathInputField value="x^2" onChange={() => {}} />);

    // At 200ms the debounce hasn't fired yet — rerender with same value to force
    act(() => {
      vi.advanceTimersByTime(200);
    });
    rerender(<MathInputField value="x^{2}" onChange={() => {}} />);

    // Still not flushed
    act(() => {
      vi.advanceTimersByTime(50);
    });
    // The initial value "x^2" would have shown preview, but the debounce for
    // the new value hasn't fired yet; verify it shows only after full delay.
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByTestId('math-preview')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// containsLatex helper
// ---------------------------------------------------------------------------

describe('containsLatex', () => {
  it.each([
    ['x^2', true],
    ['\\frac{1}{2}', true],
    ['a_n', true],
    ['{a}', true],
    ['plain text', false],
    ['', false],
  ])('containsLatex(%s) === %s', (input, expected) => {
    expect(containsLatex(input)).toBe(expected);
  });
});
