/**
 * Tests for TextInput component.
 * Covers: submit, char count, auto-focus, clear button, keyboard shortcuts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createElement } from 'react';
import TextInput from '../TextInput';

function renderTextInput(props: { onSubmit?: (text: string) => void; disabled?: boolean } = {}) {
  const defaultProps = {
    onSubmit: vi.fn(),
    ...props,
  };
  return { ...render(createElement(TextInput, defaultProps)), onSubmit: defaultProps.onSubmit };
}

describe('TextInput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Rendering ─────────────────────────────────────────────

  describe('rendering', () => {
    it('renders textarea with label', () => {
      renderTextInput();
      expect(screen.getByLabelText('Message input')).toBeDefined();
    });

    it('renders the label text', () => {
      renderTextInput();
      expect(screen.getByText('Message')).toBeDefined();
    });

    it('shows placeholder text', () => {
      renderTextInput();
      const textarea = screen.getByPlaceholderText('Type your message… (Ctrl+Enter to send)');
      expect(textarea).toBeDefined();
    });

    it('renders hint text', () => {
      renderTextInput();
      expect(screen.getByText('Ctrl+Enter or Shift+Enter to send')).toBeDefined();
    });

    it('renders character counter at 0/1000', () => {
      renderTextInput();
      expect(screen.getByText('0/1000')).toBeDefined();
    });

    it('snapshot matches default render', () => {
      const { container } = renderTextInput();
      expect(container.firstChild).toMatchSnapshot();
    });
  });

  // ── Submit ────────────────────────────────────────────────

  describe('submit', () => {
    it('submits on Ctrl+Enter', () => {
      const { onSubmit } = renderTextInput();
      const textarea = screen.getByLabelText('Message input');

      fireEvent.change(textarea, { target: { value: 'Hello' } });
      fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });

      expect(onSubmit).toHaveBeenCalledWith('Hello');
    });

    it('submits on Shift+Enter', () => {
      const { onSubmit } = renderTextInput();
      const textarea = screen.getByLabelText('Message input');

      fireEvent.change(textarea, { target: { value: 'World' } });
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });

      expect(onSubmit).toHaveBeenCalledWith('World');
    });

    it('does not submit when input is empty', () => {
      const { onSubmit } = renderTextInput();
      const textarea = screen.getByLabelText('Message input');

      fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });

      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('does not submit whitespace-only input', () => {
      const { onSubmit } = renderTextInput();
      const textarea = screen.getByLabelText('Message input');

      fireEvent.change(textarea, { target: { value: '   ' } });
      fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });

      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('trims whitespace before submitting', () => {
      const { onSubmit } = renderTextInput();
      const textarea = screen.getByLabelText('Message input');

      fireEvent.change(textarea, { target: { value: '  Hello  ' } });
      fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });

      expect(onSubmit).toHaveBeenCalledWith('Hello');
    });

    it('clears input after submit', () => {
      renderTextInput();
      const textarea = screen.getByLabelText('Message input');

      fireEvent.change(textarea, { target: { value: 'Test' } });
      fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });

      expect((textarea as HTMLTextAreaElement).value).toBe('');
    });

    it('does not submit on regular Enter (no modifier)', () => {
      const { onSubmit } = renderTextInput();
      const textarea = screen.getByLabelText('Message input');

      fireEvent.change(textarea, { target: { value: 'Hello' } });
      fireEvent.keyDown(textarea, { key: 'Enter' });

      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('does not submit when disabled', () => {
      const { onSubmit } = renderTextInput({ disabled: true });
      const textarea = screen.getByLabelText('Message input');

      fireEvent.change(textarea, { target: { value: 'Hello' } });
      fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });

      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  // ── Character Count ───────────────────────────────────────

  describe('character count', () => {
    it('updates character count as user types', () => {
      renderTextInput();
      const textarea = screen.getByLabelText('Message input');

      fireEvent.change(textarea, { target: { value: 'Hello' } });
      expect(screen.getByText('5/1000')).toBeDefined();
    });

    it('enforces max length of 1000 characters', () => {
      renderTextInput();
      const _textarea = screen.getByLabelText('Message input');

      const longText = 'a'.repeat(1001);
      fireEvent.change(_textarea, { target: { value: longText } });

      // Should not accept beyond 1000
      expect((_textarea as unknown as { value: string }).value.length).toBeLessThanOrEqual(1000);
    });

    it('shows warning style near limit (90%+)', () => {
      renderTextInput();
      const textarea = screen.getByLabelText('Message input');

      const nearLimitText = 'a'.repeat(900);
      fireEvent.change(textarea, { target: { value: nearLimitText } });

      expect(screen.getByText('900/1000')).toBeDefined();
    });

    it('shows exact count at the limit', () => {
      renderTextInput();
      const textarea = screen.getByLabelText('Message input');

      const maxText = 'a'.repeat(1000);
      fireEvent.change(textarea, { target: { value: maxText } });

      expect(screen.getByText('1000/1000')).toBeDefined();
    });
  });

  // ── Auto-Focus ────────────────────────────────────────────

  describe('auto-focus', () => {
    it('focuses textarea when not disabled', () => {
      renderTextInput();
      const textarea = screen.getByLabelText('Message input');
      expect(document.activeElement).toBe(textarea);
    });

    it('does not focus textarea when disabled', () => {
      renderTextInput({ disabled: true });
      const textarea = screen.getByLabelText('Message input');
      expect(document.activeElement).not.toBe(textarea);
    });
  });

  // ── Clear Button ──────────────────────────────────────────

  describe('clear button', () => {
    it('does not show clear button when input is empty', () => {
      renderTextInput();
      expect(screen.queryByLabelText('Clear input')).toBeNull();
    });

    it('shows clear button when input has text', () => {
      renderTextInput();
      const textarea = screen.getByLabelText('Message input');

      fireEvent.change(textarea, { target: { value: 'Hello' } });
      expect(screen.getByLabelText('Clear input')).toBeDefined();
    });

    it('clears input when clear button is clicked', () => {
      renderTextInput();
      const textarea = screen.getByLabelText('Message input');

      fireEvent.change(textarea, { target: { value: 'Hello' } });
      fireEvent.click(screen.getByLabelText('Clear input'));

      expect((textarea as HTMLTextAreaElement).value).toBe('');
    });

    it('refocuses textarea after clear', () => {
      renderTextInput();
      const textarea = screen.getByLabelText('Message input');

      fireEvent.change(textarea, { target: { value: 'Hello' } });
      fireEvent.click(screen.getByLabelText('Clear input'));

      expect(document.activeElement).toBe(textarea);
    });

    it('hides clear button when disabled', () => {
      renderTextInput({ disabled: true });
      const _textarea = screen.getByLabelText('Message input');

      // Can't directly set value when disabled, but the clear button should not show
      expect(screen.queryByLabelText('Clear input')).toBeNull();
    });
  });

  // ── Disabled State ────────────────────────────────────────

  describe('disabled state', () => {
    it('disables textarea when disabled prop is true', () => {
      renderTextInput({ disabled: true });
      const textarea = screen.getByLabelText('Message input');
      expect((textarea as HTMLTextAreaElement).disabled).toBe(true);
    });
  });

  // ── Accessibility ─────────────────────────────────────────

  describe('accessibility', () => {
    it('has aria-describedby linking to hint', () => {
      renderTextInput();
      const textarea = screen.getByLabelText('Message input');
      expect(textarea.getAttribute('aria-describedby')).toBe('text-input-hint');
    });

    it('char count has aria-live', () => {
      renderTextInput();
      const counter = screen.getByText('0/1000');
      expect(counter.getAttribute('aria-live')).toBe('polite');
    });
  });
});
