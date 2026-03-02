import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WhiteboardCanvas } from '../WhiteboardCanvas';

/* Stub canvas getContext so jsdom doesn't return null */
beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    lineCap: 'butt',
    lineJoin: 'miter',
  }) as unknown as typeof HTMLCanvasElement.prototype.getContext;
});

describe('WhiteboardCanvas a11y', () => {
  it('canvas container has role="application" and aria-label="Whiteboard"', () => {
    render(<WhiteboardCanvas batches={[]} onWarning={vi.fn()} />);
    const app = screen.getByRole('application');
    expect(app).toHaveAttribute('aria-label', 'Whiteboard');
  });

  it('stats overlay has aria-live="polite"', () => {
    render(<WhiteboardCanvas batches={[]} onWarning={vi.fn()} />);
    // The aria-live attribute is on the zoom-level span
    const zoomLevels = screen.getAllByTestId('zoom-level');
    expect(zoomLevels[0]).toHaveAttribute('aria-live', 'polite');
  });
});
