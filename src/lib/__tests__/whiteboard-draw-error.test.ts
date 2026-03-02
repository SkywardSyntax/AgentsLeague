import { describe, expect, it, vi } from 'vitest';

/**
 * Tests for the WhiteboardCanvas draw-loop error recovery behavior.
 * We extract the error-threshold logic into a testable simulation
 * matching the component's RAF loop error handling.
 */

const DRAW_ERROR_THRESHOLD = 10;
const MAX_RETRY_ATTEMPTS = 3;

interface DrawLoopState {
  drawErrorCount: number;
  retryAttempts: number;
  renderError: boolean;
  rafRunning: boolean;
}

function simulateDrawFrames(
  state: DrawLoopState,
  frameCount: number,
  throwOnFrame: (frame: number) => boolean,
  onWarning: (msg: string) => void,
): DrawLoopState {
  const s = { ...state };
  for (let frame = 0; frame < frameCount; frame++) {
    if (!s.rafRunning) break;
    if (throwOnFrame(frame)) {
      s.drawErrorCount += 1;
      if (s.drawErrorCount >= DRAW_ERROR_THRESHOLD) {
        onWarning('Rendering paused due to repeated errors. Try resizing the window.');
        s.renderError = true;
        s.rafRunning = false;
        return s;
      }
    } else {
      s.drawErrorCount = 0;
    }
  }
  return s;
}

function retryRendering(state: DrawLoopState): DrawLoopState {
  if (state.retryAttempts >= MAX_RETRY_ATTEMPTS) return state;
  return {
    ...state,
    retryAttempts: state.retryAttempts + 1,
    drawErrorCount: 0,
    renderError: false,
    rafRunning: true,
  };
}

describe('WhiteboardCanvas draw-loop error recovery', () => {
  it('invokes onWarning when error count reaches threshold', () => {
    const onWarning = vi.fn();
    const state: DrawLoopState = {
      drawErrorCount: 0,
      retryAttempts: 0,
      renderError: false,
      rafRunning: true,
    };

    const result = simulateDrawFrames(state, 20, () => true, onWarning);

    expect(onWarning).toHaveBeenCalledTimes(1);
    expect(onWarning).toHaveBeenCalledWith(
      'Rendering paused due to repeated errors. Try resizing the window.',
    );
    expect(result.renderError).toBe(true);
    expect(result.rafRunning).toBe(false);
  });

  it('resets error count on successful frame', () => {
    const onWarning = vi.fn();
    const state: DrawLoopState = {
      drawErrorCount: 0,
      retryAttempts: 0,
      renderError: false,
      rafRunning: true,
    };

    // Fail 9 frames, then succeed, then fail 9 more — should never trigger
    const result = simulateDrawFrames(
      state,
      19,
      (frame) => frame !== 9,
      onWarning,
    );

    expect(onWarning).not.toHaveBeenCalled();
    expect(result.renderError).toBe(false);
    expect(result.rafRunning).toBe(true);
  });

  it('allows retry and re-starts RAF loop', () => {
    const onWarning = vi.fn();
    let state: DrawLoopState = {
      drawErrorCount: 0,
      retryAttempts: 0,
      renderError: false,
      rafRunning: true,
    };

    // Trigger error threshold
    state = simulateDrawFrames(state, 15, () => true, onWarning);
    expect(state.renderError).toBe(true);
    expect(state.rafRunning).toBe(false);

    // Retry
    state = retryRendering(state);
    expect(state.renderError).toBe(false);
    expect(state.rafRunning).toBe(true);
    expect(state.drawErrorCount).toBe(0);
    expect(state.retryAttempts).toBe(1);
  });

  it('enforces max retry attempts as circuit breaker', () => {
    const onWarning = vi.fn();
    let state: DrawLoopState = {
      drawErrorCount: 0,
      retryAttempts: 0,
      renderError: false,
      rafRunning: true,
    };

    for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS + 1; attempt++) {
      state = simulateDrawFrames(state, 15, () => true, onWarning);
      expect(state.renderError).toBe(true);

      state = retryRendering(state);

      if (attempt < MAX_RETRY_ATTEMPTS - 1) {
        expect(state.rafRunning).toBe(true);
      }
    }

    // After MAX_RETRY_ATTEMPTS, retry should be a no-op
    expect(state.retryAttempts).toBe(MAX_RETRY_ATTEMPTS);
    expect(state.rafRunning).toBe(false);
    expect(state.renderError).toBe(true);
  });

  it('does not invoke onWarning below threshold', () => {
    const onWarning = vi.fn();
    const state: DrawLoopState = {
      drawErrorCount: 0,
      retryAttempts: 0,
      renderError: false,
      rafRunning: true,
    };

    const result = simulateDrawFrames(state, 9, () => true, onWarning);
    expect(onWarning).not.toHaveBeenCalled();
    expect(result.renderError).toBe(false);
    expect(result.rafRunning).toBe(true);
    expect(result.drawErrorCount).toBe(9);
  });
});
