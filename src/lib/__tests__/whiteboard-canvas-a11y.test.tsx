import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { WhiteboardCanvas } from '@/components/whiteboard/WhiteboardCanvas';

beforeEach(() => {
  vi.stubGlobal('devicePixelRatio', 1);

  // Only call the callback once to avoid infinite rAF loop
  let rafCalled = false;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    if (!rafCalled) {
      rafCalled = true;
      cb(0);
    }
    return 0;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal('getComputedStyle', () => ({
    getPropertyValue: () => '',
  }));

  // Mock canvas getContext to return a stub 2d context
  const ctxStub = {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineCap: 'round',
    lineJoin: 'round',
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
  };
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(ctxStub) as unknown as typeof HTMLCanvasElement.prototype.getContext;
});

afterEach(cleanup);

describe('WhiteboardCanvas accessibility', () => {
  it('all 4 control buttons have accessible names via aria-label', () => {
    render(<WhiteboardCanvas batches={[]} onWarning={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Reset view' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Zoom out' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Fit to content' })).toBeTruthy();
  });

  it('zoom display has aria-live="polite" region', () => {
    render(<WhiteboardCanvas batches={[]} onWarning={vi.fn()} />);

    const zoomDisplay = screen.getByTestId('zoom-level');
    expect(zoomDisplay.getAttribute('aria-live')).toBe('polite');
    expect(zoomDisplay.getAttribute('aria-atomic')).toBe('true');
    expect(zoomDisplay.textContent).toBe('100%');
  });

  it('canvas container has accessible role and label', () => {
    render(<WhiteboardCanvas batches={[]} onWarning={vi.fn()} />);

    const whiteboard = screen.getByRole('application');
    expect(whiteboard).toBeTruthy();
    expect(whiteboard.getAttribute('aria-label')).toBe('Whiteboard');
  });

  it('all control buttons have focus-visible ring styles', () => {
    render(<WhiteboardCanvas batches={[]} onWarning={vi.fn()} />);

    const buttons = screen.getAllByRole('button');
    for (const button of buttons) {
      expect(button.className).toContain('focus-visible:ring-2');
    }
  });
});
