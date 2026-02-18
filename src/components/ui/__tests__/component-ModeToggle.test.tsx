/**
 * Tests for ModeToggle component.
 * Covers: switch modes, confirmation dialog, keyboard navigation, a11y.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createElement } from 'react';
import ModeToggle from '../ModeToggle';
import { InteractionMode } from '@/types/interaction';

// ── Mocks ───────────────────────────────────────────────────────

let mockMode = InteractionMode.TEXT;
const mockSwitchMode = vi.fn();

vi.mock('@/hooks/interaction/useInteractionMode', () => ({
  useInteractionMode: () => ({
    mode: mockMode,
    switchMode: mockSwitchMode,
  }),
}));

let mockMessages: unknown[] = [];

vi.mock('@/stores/conversation-store', () => ({
  useConversationStore: (selector: (s: { messages: unknown[] }) => unknown) =>
    selector({ messages: mockMessages }),
}));

function renderModeToggle(props: { onChange?: (mode: InteractionMode) => void } = {}) {
  return render(createElement(ModeToggle, props));
}

describe('ModeToggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMode = InteractionMode.TEXT;
    mockMessages = [];
  });

  // ── Rendering ─────────────────────────────────────────────

  describe('rendering', () => {
    it('renders radiogroup with correct label', () => {
      renderModeToggle();
      expect(screen.getByRole('radiogroup', { name: 'Interaction mode' })).toBeDefined();
    });

    it('renders Text radio button', () => {
      renderModeToggle();
      expect(screen.getByRole('radio', { name: 'Text mode' })).toBeDefined();
    });

    it('renders Voice radio button', () => {
      renderModeToggle();
      expect(screen.getByRole('radio', { name: 'Voice mode' })).toBeDefined();
    });

    it('renders Text and Voice labels', () => {
      renderModeToggle();
      expect(screen.getByText('Text')).toBeDefined();
      expect(screen.getByText('Voice')).toBeDefined();
    });

    it('snapshot matches text mode', () => {
      const { container } = renderModeToggle();
      expect(container.firstChild).toMatchSnapshot();
    });

    it('snapshot matches voice mode', () => {
      mockMode = InteractionMode.VOICE;
      const { container } = renderModeToggle();
      expect(container.firstChild).toMatchSnapshot();
    });
  });

  // ── Mode State ────────────────────────────────────────────

  describe('mode state', () => {
    it('text mode is checked when mode is TEXT', () => {
      mockMode = InteractionMode.TEXT;
      renderModeToggle();
      const textRadio = screen.getByRole('radio', { name: 'Text mode' });
      expect(textRadio.getAttribute('aria-checked')).toBe('true');
      const voiceRadio = screen.getByRole('radio', { name: 'Voice mode' });
      expect(voiceRadio.getAttribute('aria-checked')).toBe('false');
    });

    it('voice mode is checked when mode is VOICE', () => {
      mockMode = InteractionMode.VOICE;
      renderModeToggle();
      const textRadio = screen.getByRole('radio', { name: 'Text mode' });
      expect(textRadio.getAttribute('aria-checked')).toBe('false');
      const voiceRadio = screen.getByRole('radio', { name: 'Voice mode' });
      expect(voiceRadio.getAttribute('aria-checked')).toBe('true');
    });

    it('active radio has tabIndex 0, inactive has -1', () => {
      mockMode = InteractionMode.TEXT;
      renderModeToggle();
      const textRadio = screen.getByRole('radio', { name: 'Text mode' });
      const voiceRadio = screen.getByRole('radio', { name: 'Voice mode' });
      expect(textRadio.getAttribute('tabindex')).toBe('0');
      expect(voiceRadio.getAttribute('tabindex')).toBe('-1');
    });
  });

  // ── Switching Modes ───────────────────────────────────────

  describe('switching modes', () => {
    it('switches to voice mode when Voice button clicked', () => {
      mockMode = InteractionMode.TEXT;
      renderModeToggle();
      fireEvent.click(screen.getByRole('radio', { name: 'Voice mode' }));
      expect(mockSwitchMode).toHaveBeenCalledWith(InteractionMode.VOICE);
    });

    it('switches to text mode when Text button clicked', () => {
      mockMode = InteractionMode.VOICE;
      renderModeToggle();
      fireEvent.click(screen.getByRole('radio', { name: 'Text mode' }));
      expect(mockSwitchMode).toHaveBeenCalledWith(InteractionMode.TEXT);
    });

    it('does not switch when clicking already active mode', () => {
      mockMode = InteractionMode.TEXT;
      renderModeToggle();
      fireEvent.click(screen.getByRole('radio', { name: 'Text mode' }));
      expect(mockSwitchMode).not.toHaveBeenCalled();
    });

    it('calls onChange callback when switching', () => {
      const onChange = vi.fn();
      renderModeToggle({ onChange });
      fireEvent.click(screen.getByRole('radio', { name: 'Voice mode' }));
      expect(onChange).toHaveBeenCalledWith(InteractionMode.VOICE);
    });
  });

  // ── Confirmation Dialog ───────────────────────────────────

  describe('confirmation dialog', () => {
    it('shows confirmation when switching with existing conversation', () => {
      mockMessages = [{ id: 'msg-1' }];
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

      renderModeToggle();
      fireEvent.click(screen.getByRole('radio', { name: 'Voice mode' }));

      expect(confirmSpy).toHaveBeenCalledWith(
        'Switching modes will not clear your conversation, but the input context may change. Continue?',
      );
      expect(mockSwitchMode).toHaveBeenCalledWith(InteractionMode.VOICE);
      confirmSpy.mockRestore();
    });

    it('does not switch when user cancels confirmation', () => {
      mockMessages = [{ id: 'msg-1' }];
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

      renderModeToggle();
      fireEvent.click(screen.getByRole('radio', { name: 'Voice mode' }));

      expect(confirmSpy).toHaveBeenCalled();
      expect(mockSwitchMode).not.toHaveBeenCalled();
      confirmSpy.mockRestore();
    });

    it('does not show confirmation when conversation is empty', () => {
      mockMessages = [];
      const confirmSpy = vi.spyOn(window, 'confirm');

      renderModeToggle();
      fireEvent.click(screen.getByRole('radio', { name: 'Voice mode' }));

      expect(confirmSpy).not.toHaveBeenCalled();
      expect(mockSwitchMode).toHaveBeenCalledWith(InteractionMode.VOICE);
      confirmSpy.mockRestore();
    });
  });

  // ── Keyboard Navigation ───────────────────────────────────

  describe('keyboard navigation', () => {
    it('ArrowRight switches to voice mode', () => {
      mockMode = InteractionMode.TEXT;
      renderModeToggle();
      const radiogroup = screen.getByRole('radiogroup');
      fireEvent.keyDown(radiogroup, { key: 'ArrowRight' });
      expect(mockSwitchMode).toHaveBeenCalledWith(InteractionMode.VOICE);
    });

    it('ArrowDown switches to voice mode', () => {
      mockMode = InteractionMode.TEXT;
      renderModeToggle();
      const radiogroup = screen.getByRole('radiogroup');
      fireEvent.keyDown(radiogroup, { key: 'ArrowDown' });
      expect(mockSwitchMode).toHaveBeenCalledWith(InteractionMode.VOICE);
    });

    it('ArrowLeft switches to text mode', () => {
      mockMode = InteractionMode.VOICE;
      renderModeToggle();
      const radiogroup = screen.getByRole('radiogroup');
      fireEvent.keyDown(radiogroup, { key: 'ArrowLeft' });
      expect(mockSwitchMode).toHaveBeenCalledWith(InteractionMode.TEXT);
    });

    it('ArrowUp switches to text mode', () => {
      mockMode = InteractionMode.VOICE;
      renderModeToggle();
      const radiogroup = screen.getByRole('radiogroup');
      fireEvent.keyDown(radiogroup, { key: 'ArrowUp' });
      expect(mockSwitchMode).toHaveBeenCalledWith(InteractionMode.TEXT);
    });

    it('ignores unrelated keys', () => {
      renderModeToggle();
      const radiogroup = screen.getByRole('radiogroup');
      fireEvent.keyDown(radiogroup, { key: 'Enter' });
      expect(mockSwitchMode).not.toHaveBeenCalled();
    });
  });

  // ── Sliding Indicator ─────────────────────────────────────

  describe('sliding indicator', () => {
    it('positions indicator at start for text mode', () => {
      mockMode = InteractionMode.TEXT;
      const { container } = renderModeToggle();
      const indicator = container.querySelector('[aria-hidden="true"]')!;
      expect((indicator as HTMLElement).style.transform).toBe('translateX(0)');
    });

    it('positions indicator translated for voice mode', () => {
      mockMode = InteractionMode.VOICE;
      const { container } = renderModeToggle();
      const indicator = container.querySelector('[aria-hidden="true"]')!;
      expect((indicator as HTMLElement).style.transform).toContain('translateX');
      expect((indicator as HTMLElement).style.transform).not.toBe('translateX(0)');
    });
  });
});
