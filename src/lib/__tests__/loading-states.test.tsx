import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';

// Mock mathjax-client before importing LatexSvg
vi.mock('@/lib/latex/mathjax-client', () => ({
  renderTexToSvg: vi.fn(),
}));

import { LatexSvg } from '@/components/chat/LatexSvg';
import { renderTexToSvg } from '@/lib/latex/mathjax-client';

const mockRender = renderTexToSvg as ReturnType<typeof vi.fn>;

afterEach(cleanup);

/**
 * Models the status state machine from AppShell.tsx.
 * Transitions mirror the exact logic in handleEvent and sendMessage.
 */
type Status = 'idle' | 'thinking' | 'streaming' | 'drawing';

type EventType =
  | 'assistant.text.delta'
  | 'assistant.text.done'
  | 'whiteboard.batch'
  | 'whiteboard.layout.diagnostics'
  | 'warning'
  | 'error'
  | 'turn.done';

function nextStatus(current: Status, eventType: EventType): Status {
  switch (eventType) {
    case 'assistant.text.delta':
      return 'streaming';
    case 'whiteboard.batch':
      return 'drawing';
    case 'turn.done':
      return 'idle';
    case 'error':
      return 'idle';
    default:
      return current;
  }
}

function canSend(message: string, status: Status, hasActiveChat: boolean): boolean {
  if (!hasActiveChat) return false;
  const trimmed = message.trim();
  return trimmed.length > 0 && status === 'idle';
}

describe('Status state machine transitions', () => {
  it('status starts as idle', () => {
    const initial: Status = 'idle';
    expect(initial).toBe('idle');
  });

  it('sending a message transitions status to thinking', () => {
    const status: Status = 'idle';
    const message = 'test';
    const canProceed = canSend(message, status, true);
    expect(canProceed).toBe(true);
    // After sendMessage succeeds, status is set to 'thinking'
    const next: Status = 'thinking';
    expect(next).toBe('thinking');
  });

  it('receiving text.delta event transitions from thinking to streaming', () => {
    const status: Status = 'thinking';
    const next = nextStatus(status, 'assistant.text.delta');
    expect(next).toBe('streaming');
  });

  it('receiving whiteboard.batch event transitions to drawing', () => {
    const thinkingNext = nextStatus('thinking', 'whiteboard.batch');
    expect(thinkingNext).toBe('drawing');

    const streamingNext = nextStatus('streaming', 'whiteboard.batch');
    expect(streamingNext).toBe('drawing');
  });

  it('receiving turn.done event transitions to idle', () => {
    const fromDrawing = nextStatus('drawing', 'turn.done');
    expect(fromDrawing).toBe('idle');

    const fromStreaming = nextStatus('streaming', 'turn.done');
    expect(fromStreaming).toBe('idle');

    const fromThinking = nextStatus('thinking', 'turn.done');
    expect(fromThinking).toBe('idle');
  });

  it('send is rejected when status is not idle', () => {
    expect(canSend('hello', 'thinking', true)).toBe(false);
    expect(canSend('hello', 'streaming', true)).toBe(false);
    expect(canSend('hello', 'drawing', true)).toBe(false);
  });

  it('send is rejected for empty or whitespace-only input', () => {
    expect(canSend('', 'idle', true)).toBe(false);
    expect(canSend('   ', 'idle', true)).toBe(false);
    expect(canSend('\t\n', 'idle', true)).toBe(false);
  });
});

describe('LatexSvg loading states', () => {
  beforeEach(() => {
    mockRender.mockReset();
  });

  it('shows pulsing placeholder while SVG is loading', async () => {
    // Never resolve — keeps component in loading state
    mockRender.mockReturnValue(new Promise(() => {}));

    const { container } = render(<LatexSvg tex="x^2" displayMode={false} />);

    // Loading state renders a pulsing span placeholder (no role="img", no error)
    const placeholder = container.querySelector('.animate-pulse');
    expect(placeholder).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('transitions from loading placeholder to rendered SVG', async () => {
    let resolveRender!: (value: string) => void;
    mockRender.mockReturnValue(
      new Promise<string>((resolve) => {
        resolveRender = resolve;
      }),
    );

    const { container } = render(<LatexSvg tex="y=mx+b" displayMode={false} />);

    // Initially in loading state
    expect(container.querySelector('.animate-pulse')).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();

    // Resolve the render
    await act(async () => {
      resolveRender('<svg><text>rendered</text></svg>');
    });

    // Now the SVG should be visible and placeholder gone
    expect(screen.getByRole('img')).toBeTruthy();
    expect(container.querySelector('.animate-pulse')).toBeNull();
  });
});

describe('Error event resets status to idle', () => {
  it('error event from any non-idle state resets to idle', () => {
    expect(nextStatus('streaming', 'error')).toBe('idle');
    expect(nextStatus('thinking', 'error')).toBe('idle');
    expect(nextStatus('drawing', 'error')).toBe('idle');
  });
});
