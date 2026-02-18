/**
 * Tests for VoiceIndicator component.
 * Covers: state transitions, waveform, mic button, confidence, error, transcription preview.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createElement } from 'react';
import VoiceIndicator from '../VoiceIndicator';
import { VoiceState, type VoiceSession } from '@/types/interaction';

// ── Mocks ───────────────────────────────────────────────────────

const mockStartListening = vi.fn();
const mockStopListening = vi.fn();
const mockCancel = vi.fn();

let mockSession: VoiceSession = {
  state: VoiceState.IDLE,
  interimTranscript: '',
  finalTranscript: '',
  confidence: 0,
  error: null,
};
let mockIsSupported = true;

vi.mock('@/hooks/interaction/useVoiceMode', () => ({
  useVoiceMode: () => ({
    session: mockSession,
    isSupported: mockIsSupported,
    startListening: mockStartListening,
    stopListening: mockStopListening,
    cancel: mockCancel,
  }),
}));

function renderVoiceIndicator(props: { audioLevel?: number; className?: string } = {}) {
  return render(createElement(VoiceIndicator, props));
}

describe('VoiceIndicator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession = {
      state: VoiceState.IDLE,
      interimTranscript: '',
      finalTranscript: '',
      confidence: 0,
      error: null,
    };
    mockIsSupported = true;
  });

  // ── Rendering ─────────────────────────────────────────────

  describe('rendering', () => {
    it('renders voice input region', () => {
      renderVoiceIndicator();
      expect(screen.getByRole('region', { name: 'Voice input' })).toBeDefined();
    });

    it('renders mic button', () => {
      renderVoiceIndicator();
      expect(screen.getByLabelText('Start voice input')).toBeDefined();
    });

    it('snapshot matches idle state', () => {
      const { container } = renderVoiceIndicator();
      expect(container.firstChild).toMatchSnapshot();
    });

    it('applies custom className', () => {
      const { container } = renderVoiceIndicator({ className: 'custom-class' });
      const region = container.firstChild as HTMLElement;
      expect(region.className).toContain('custom-class');
    });
  });

  // ── Idle State ────────────────────────────────────────────

  describe('idle state', () => {
    it('shows start voice input button', () => {
      renderVoiceIndicator();
      expect(screen.getByLabelText('Start voice input')).toBeDefined();
    });

    it('does not show cancel button', () => {
      renderVoiceIndicator();
      expect(screen.queryByLabelText('Cancel voice input')).toBeNull();
    });

    it('does not show waveform', () => {
      renderVoiceIndicator();
      expect(screen.queryByLabelText('Audio waveform visualizer active')).toBeNull();
    });

    it('does not show state label', () => {
      renderVoiceIndicator();
      expect(screen.queryByText('Ready')).toBeNull();
    });
  });

  // ── Listening State ───────────────────────────────────────

  describe('listening state', () => {
    beforeEach(() => {
      mockSession = { ...mockSession, state: VoiceState.LISTENING };
    });

    it('shows stop listening button', () => {
      renderVoiceIndicator();
      expect(screen.getByLabelText('Stop listening')).toBeDefined();
    });

    it('shows waveform visualizer', () => {
      renderVoiceIndicator();
      expect(screen.getByLabelText('Audio waveform visualizer active')).toBeDefined();
    });

    it('shows state label "Listening..."', () => {
      renderVoiceIndicator();
      expect(screen.getByText('Listening...')).toBeDefined();
    });

    it('shows cancel button', () => {
      renderVoiceIndicator();
      expect(screen.getByLabelText('Cancel voice input')).toBeDefined();
    });

    it('shows stop recording button', () => {
      renderVoiceIndicator();
      expect(screen.getByLabelText('Stop recording')).toBeDefined();
    });

    it('renders waveform bars', () => {
      renderVoiceIndicator({ audioLevel: 0.5 });
      const waveform = screen.getByLabelText('Audio waveform visualizer active');
      const bars = waveform.querySelectorAll('div[class*="rounded-full"]');
      expect(bars.length).toBe(24); // BAR_COUNT
    });
  });

  // ── Processing States ─────────────────────────────────────

  describe('processing states', () => {
    it('shows "Processing..." for TRANSCRIBING state', () => {
      mockSession = { ...mockSession, state: VoiceState.TRANSCRIBING };
      renderVoiceIndicator();
      expect(screen.getByText('Processing...')).toBeDefined();
    });

    it('shows "Sending..." for SENDING state', () => {
      mockSession = { ...mockSession, state: VoiceState.SENDING };
      renderVoiceIndicator();
      expect(screen.getByText('Sending...')).toBeDefined();
    });

    it('shows "Receiving response..." for STREAMING state', () => {
      mockSession = { ...mockSession, state: VoiceState.STREAMING };
      renderVoiceIndicator();
      expect(screen.getByText('Receiving response...')).toBeDefined();
    });

    it('shows "Drawing..." for DRAWING state', () => {
      mockSession = { ...mockSession, state: VoiceState.DRAWING };
      renderVoiceIndicator();
      expect(screen.getByText('Drawing...')).toBeDefined();
    });

    it('shows "Speaking..." for SPEAKING state', () => {
      mockSession = { ...mockSession, state: VoiceState.SPEAKING };
      renderVoiceIndicator();
      expect(screen.getByText('Speaking...')).toBeDefined();
    });

    it('disables mic button during processing', () => {
      mockSession = { ...mockSession, state: VoiceState.TRANSCRIBING };
      renderVoiceIndicator();
      const micBtn = screen.getByLabelText('Processing voice input');
      expect(micBtn.hasAttribute('disabled')).toBe(true);
    });
  });

  // ── Complete State ────────────────────────────────────────

  describe('complete state', () => {
    it('returns to idle-like UI (no active state label shown)', () => {
      mockSession = { ...mockSession, state: VoiceState.COMPLETE };
      renderVoiceIndicator();
      // COMPLETE is not an active state, so no state label is shown
      expect(screen.queryByText('Complete')).toBeNull();
      expect(screen.queryByLabelText('Cancel voice input')).toBeNull();
    });
  });

  // ── Waveform ──────────────────────────────────────────────

  describe('waveform', () => {
    it('does not show waveform when not listening', () => {
      mockSession = { ...mockSession, state: VoiceState.TRANSCRIBING };
      renderVoiceIndicator();
      expect(screen.queryByLabelText('Audio waveform visualizer active')).toBeNull();
    });

    it('shows idle waveform label when not active', () => {
      // In idle state, waveform is not rendered at all
      renderVoiceIndicator();
      expect(screen.queryByRole('img')).toBeNull();
    });
  });

  // ── Mic Button Actions ────────────────────────────────────

  describe('mic button actions', () => {
    it('calls startListening when clicked in idle state', () => {
      renderVoiceIndicator();
      fireEvent.click(screen.getByLabelText('Start voice input'));
      expect(mockStartListening).toHaveBeenCalled();
    });

    it('calls stopListening when clicked in listening state', () => {
      mockSession = { ...mockSession, state: VoiceState.LISTENING };
      renderVoiceIndicator();
      fireEvent.click(screen.getByLabelText('Stop listening'));
      expect(mockStopListening).toHaveBeenCalled();
    });

    it('does not call start or stop when in processing state', () => {
      mockSession = { ...mockSession, state: VoiceState.SENDING };
      renderVoiceIndicator();
      const micBtn = screen.getByLabelText('Processing voice input');
      fireEvent.click(micBtn);
      expect(mockStartListening).not.toHaveBeenCalled();
      expect(mockStopListening).not.toHaveBeenCalled();
    });
  });

  // ── Cancel Button ─────────────────────────────────────────

  describe('cancel button', () => {
    it('calls cancel when clicked', () => {
      mockSession = { ...mockSession, state: VoiceState.LISTENING };
      renderVoiceIndicator();
      fireEvent.click(screen.getByLabelText('Cancel voice input'));
      expect(mockCancel).toHaveBeenCalled();
    });

    it('shows cancel for all active states', () => {
      const activeStates = [
        VoiceState.LISTENING,
        VoiceState.TRANSCRIBING,
        VoiceState.SENDING,
        VoiceState.STREAMING,
        VoiceState.DRAWING,
        VoiceState.SPEAKING,
      ];
      for (const state of activeStates) {
        mockSession = { ...mockSession, state };
        const { unmount } = renderVoiceIndicator();
        expect(screen.getByLabelText('Cancel voice input')).toBeDefined();
        unmount();
      }
    });
  });

  // ── Confidence Display ────────────────────────────────────

  describe('confidence display', () => {
    it('shows confidence score when > 0 and active', () => {
      mockSession = { ...mockSession, state: VoiceState.LISTENING, confidence: 0.92 };
      renderVoiceIndicator();
      expect(screen.getByLabelText('Confidence 92 percent')).toBeDefined();
    });

    it('does not show confidence when 0', () => {
      mockSession = { ...mockSession, state: VoiceState.LISTENING, confidence: 0 };
      renderVoiceIndicator();
      expect(screen.queryByLabelText(/Confidence/)).toBeNull();
    });

    it('shows green color for high confidence (>=80%)', () => {
      mockSession = { ...mockSession, state: VoiceState.LISTENING, confidence: 0.85 };
      renderVoiceIndicator();
      const score = screen.getByLabelText('Confidence 85 percent');
      expect(score.className).toContain('text-success');
    });

    it('shows warning color for medium confidence (50-79%)', () => {
      mockSession = { ...mockSession, state: VoiceState.LISTENING, confidence: 0.65 };
      renderVoiceIndicator();
      const score = screen.getByLabelText('Confidence 65 percent');
      expect(score.className).toContain('text-warning');
    });

    it('shows error color for low confidence (<50%)', () => {
      mockSession = { ...mockSession, state: VoiceState.LISTENING, confidence: 0.3 };
      renderVoiceIndicator();
      const score = screen.getByLabelText('Confidence 30 percent');
      expect(score.className).toContain('text-error');
    });
  });

  // ── Error State ───────────────────────────────────────────

  describe('error state', () => {
    it('shows error alert when error is set', () => {
      mockSession = { ...mockSession, error: 'Microphone access denied' };
      renderVoiceIndicator();
      const alert = screen.getByRole('alert');
      expect(alert).toBeDefined();
      expect(screen.getByText('Microphone access denied')).toBeDefined();
    });

    it('does not show error alert when no error', () => {
      renderVoiceIndicator();
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });

  // ── Transcription Preview ─────────────────────────────────

  describe('transcription preview', () => {
    it('shows interim transcript', () => {
      mockSession = {
        ...mockSession,
        state: VoiceState.LISTENING,
        interimTranscript: 'draw a blue',
      };
      renderVoiceIndicator();
      expect(screen.getByText('draw a blue')).toBeDefined();
    });

    it('shows final transcript', () => {
      mockSession = {
        ...mockSession,
        state: VoiceState.TRANSCRIBING,
        finalTranscript: 'draw a blue rectangle',
      };
      renderVoiceIndicator();
      expect(screen.getByText('draw a blue rectangle')).toBeDefined();
    });

    it('has aria-label on transcription preview', () => {
      mockSession = {
        ...mockSession,
        state: VoiceState.LISTENING,
        interimTranscript: 'test',
      };
      renderVoiceIndicator();
      expect(screen.getByLabelText('Transcription preview')).toBeDefined();
    });

    it('does not show transcription preview when empty', () => {
      mockSession = { ...mockSession, state: VoiceState.LISTENING };
      renderVoiceIndicator();
      expect(screen.queryByLabelText('Transcription preview')).toBeNull();
    });
  });

  // ── Browser Support ───────────────────────────────────────

  describe('browser support', () => {
    it('shows not supported message when voice is unsupported', () => {
      mockIsSupported = false;
      renderVoiceIndicator();
      expect(screen.getByText('Voice input is not supported in this browser.')).toBeDefined();
    });

    it('disables mic button when voice is unsupported', () => {
      mockIsSupported = false;
      renderVoiceIndicator();
      const micBtn = screen.getByLabelText('Start voice input');
      expect(micBtn.hasAttribute('disabled')).toBe(true);
    });

    it('does not show not-supported message when supported', () => {
      renderVoiceIndicator();
      expect(screen.queryByText('Voice input is not supported in this browser.')).toBeNull();
    });
  });
});
