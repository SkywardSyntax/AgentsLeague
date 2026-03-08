import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, act, fireEvent, cleanup } from '@testing-library/react';
import { DrawingQualityPanel } from '../DrawingQualityPanel';
import type { QualityPanelProps } from '../DrawingQualityPanel';
import type { DrawBatch } from '@/types/agent';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBatch(elements: Array<{ type: string; id: string }>): DrawBatch {
  return {
    batch_id: `batch-${Math.random().toString(36).slice(2)}`,
    elements: elements.map((el) => ({ ...el } as DrawBatch['elements'][number])),
  };
}

function renderPanel(overrides: Partial<QualityPanelProps> = {}) {
  const props: QualityPanelProps = {
    batches: [],
    ...overrides,
  };
  return render(<DrawingQualityPanel {...props} />);
}

function togglePanel() {
  act(() => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'q', ctrlKey: true, shiftKey: true, bubbles: true }),
    );
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DrawingQualityPanel', () => {
  afterEach(() => {
    cleanup();
  });

  it('is hidden when toggle is false (default state)', () => {
    renderPanel();
    expect(screen.queryByTestId('quality-panel')).toBeNull();
  });

  it('renders when toggle is true (simulated via Ctrl+Shift+Q)', () => {
    renderPanel();
    expect(screen.queryByTestId('quality-panel')).toBeNull();

    togglePanel();

    expect(screen.getByTestId('quality-panel')).toBeTruthy();
  });

  it('shows correct element counts from scene prop', () => {
    renderPanel({
      batches: [
        makeBatch([
          { type: 'rect', id: 'r1' },
          { type: 'rect', id: 'r2' },
          { type: 'line', id: 'l1' },
          { type: 'text', id: 't1' },
        ]),
        makeBatch([
          { type: 'rect', id: 'r3' },
          { type: 'arrow', id: 'a1' },
        ]),
      ],
    });

    togglePanel();

    const panel = screen.getByTestId('quality-panel');
    expect(panel.textContent).toContain('rect');
    expect(panel.textContent).toContain('3');
    expect(panel.textContent).toContain('line');
    expect(panel.textContent).toContain('arrow');
    expect(panel.textContent).toContain('text');
  });

  it('shows "No injections yet" when injection stats are empty', () => {
    renderPanel({ injectionStats: null });

    togglePanel();

    const panel = screen.getByTestId('quality-panel');
    expect(panel.textContent).toContain('No injections yet');
  });

  it('shows lowering stats when provided', () => {
    renderPanel({
      loweringStats: {
        inputCount: 5,
        outputCount: 42,
        capped: false,
        timingMs: 3.14,
      },
    });

    togglePanel();

    const panel = screen.getByTestId('quality-panel');
    expect(panel.textContent).toContain('Input elements: 5');
    expect(panel.textContent).toContain('Output elements: 42');
    expect(panel.textContent).toContain('Capped: no');
    expect(panel.textContent).toContain('3.14');
  });

  it('shows animation stats when provided', () => {
    renderPanel({
      animationStats: { averageFps: 59.5, totalFrames: 1200 },
    });

    togglePanel();

    const panel = screen.getByTestId('quality-panel');
    expect(panel.textContent).toContain('59.5');
    expect(panel.textContent).toContain('1200');
  });
});
