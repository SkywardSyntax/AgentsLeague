/**
 * Tests for Toolbar component.
 * Covers: buttons, undo/redo disabled state, clear confirmation,
 * mode toggle, settings, keyboard navigation, mobile menu.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { createElement } from 'react';
import Toolbar from '../Toolbar';
import { InteractionMode } from '@/types/interaction';

// ── Mocks ───────────────────────────────────────────────────────

let mockCanUndo = false;
let mockCanRedo = false;
const mockUndo = vi.fn();
const mockRedo = vi.fn();
const mockClear = vi.fn();

vi.mock('@/hooks/canvas/useUndoRedo', () => ({
  useUndoRedo: () => ({
    canUndo: mockCanUndo,
    canRedo: mockCanRedo,
    undo: mockUndo,
    redo: mockRedo,
    clear: mockClear,
  }),
}));

let mockMode = InteractionMode.TEXT;
const mockSwitchMode = vi.fn();

vi.mock('@/hooks/interaction/useInteractionMode', () => ({
  useInteractionMode: () => ({
    mode: mockMode,
    switchMode: mockSwitchMode,
  }),
}));

const mockReset = vi.fn();

vi.mock('@/stores/drawing-session', () => ({
  useDrawingSessionStore: (selector: (s: { reset: () => void }) => unknown) =>
    selector({ reset: mockReset }),
}));

function renderToolbar(props: { onSettingsOpen?: () => void } = {}) {
  return render(createElement(Toolbar, props));
}

describe('Toolbar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanUndo = false;
    mockCanRedo = false;
    mockMode = InteractionMode.TEXT;
  });

  // ── Rendering ─────────────────────────────────────────────

  describe('rendering', () => {
    it('renders desktop toolbar with correct role', () => {
      renderToolbar();
      const toolbars = screen.getAllByRole('toolbar', { name: 'Canvas controls' });
      expect(toolbars.length).toBeGreaterThanOrEqual(1);
    });

    it('renders mode toggle button', () => {
      renderToolbar();
      expect(screen.getAllByLabelText('Switch to Voice').length).toBeGreaterThanOrEqual(1);
    });

    it('renders undo button', () => {
      renderToolbar();
      expect(screen.getAllByLabelText('Undo').length).toBeGreaterThanOrEqual(1);
    });

    it('renders redo button', () => {
      renderToolbar();
      expect(screen.getAllByLabelText('Redo').length).toBeGreaterThanOrEqual(1);
    });

    it('renders clear canvas button', () => {
      renderToolbar();
      expect(screen.getAllByLabelText('Clear Canvas').length).toBeGreaterThanOrEqual(1);
    });

    it('renders settings button', () => {
      renderToolbar();
      expect(screen.getAllByLabelText('Settings').length).toBeGreaterThanOrEqual(1);
    });

    it('renders mobile menu button', () => {
      renderToolbar();
      expect(screen.getByLabelText('Open menu')).toBeDefined();
    });

    it('snapshot matches default render', () => {
      const { container } = renderToolbar();
      expect(container).toMatchSnapshot();
    });
  });

  // ── Undo / Redo Disabled State ────────────────────────────

  describe('undo/redo disabled state', () => {
    it('disables undo button when canUndo is false', () => {
      mockCanUndo = false;
      renderToolbar();
      const undoButtons = screen.getAllByLabelText('Undo');
      for (const btn of undoButtons) {
        expect(btn.hasAttribute('disabled')).toBe(true);
      }
    });

    it('enables undo button when canUndo is true', () => {
      mockCanUndo = true;
      renderToolbar();
      const undoButtons = screen.getAllByLabelText('Undo');
      expect(undoButtons.some((btn) => !btn.hasAttribute('disabled'))).toBe(true);
    });

    it('disables redo button when canRedo is false', () => {
      mockCanRedo = false;
      renderToolbar();
      const redoButtons = screen.getAllByLabelText('Redo');
      for (const btn of redoButtons) {
        expect(btn.hasAttribute('disabled')).toBe(true);
      }
    });

    it('enables redo button when canRedo is true', () => {
      mockCanRedo = true;
      renderToolbar();
      const redoButtons = screen.getAllByLabelText('Redo');
      expect(redoButtons.some((btn) => !btn.hasAttribute('disabled'))).toBe(true);
    });

    it('calls undo when undo button clicked', () => {
      mockCanUndo = true;
      renderToolbar();
      const undoBtn = screen.getAllByLabelText('Undo').find((btn) => !btn.hasAttribute('disabled'))!;
      fireEvent.click(undoBtn);
      expect(mockUndo).toHaveBeenCalled();
    });

    it('calls redo when redo button clicked', () => {
      mockCanRedo = true;
      renderToolbar();
      const redoBtn = screen.getAllByLabelText('Redo').find((btn) => !btn.hasAttribute('disabled'))!;
      fireEvent.click(redoBtn);
      expect(mockRedo).toHaveBeenCalled();
    });
  });

  // ── Mode Toggle ───────────────────────────────────────────

  describe('mode toggle', () => {
    it('shows "Switch to Voice" in text mode', () => {
      mockMode = InteractionMode.TEXT;
      renderToolbar();
      expect(screen.getAllByLabelText('Switch to Voice').length).toBeGreaterThanOrEqual(1);
    });

    it('shows "Switch to Text" in voice mode', () => {
      mockMode = InteractionMode.VOICE;
      renderToolbar();
      expect(screen.getAllByLabelText('Switch to Text').length).toBeGreaterThanOrEqual(1);
    });

    it('calls switchMode when mode toggle clicked', () => {
      mockMode = InteractionMode.TEXT;
      renderToolbar();
      const toggleBtn = screen.getAllByLabelText('Switch to Voice')[0]!;
      fireEvent.click(toggleBtn);
      expect(mockSwitchMode).toHaveBeenCalledWith(InteractionMode.VOICE);
    });

    it('toggles back to text mode when in voice mode', () => {
      mockMode = InteractionMode.VOICE;
      renderToolbar();
      const toggleBtn = screen.getAllByLabelText('Switch to Text')[0]!;
      fireEvent.click(toggleBtn);
      expect(mockSwitchMode).toHaveBeenCalledWith(InteractionMode.TEXT);
    });
  });

  // ── Clear Canvas ──────────────────────────────────────────

  describe('clear canvas', () => {
    it('shows confirmation on first click', () => {
      renderToolbar();
      const clearBtn = screen.getAllByLabelText('Clear Canvas')[0]!;
      fireEvent.click(clearBtn);
      expect(screen.getAllByText('Confirm?').length).toBeGreaterThanOrEqual(1);
    });

    it('clears canvas on confirm click', () => {
      renderToolbar();
      const clearBtn = screen.getAllByLabelText('Clear Canvas')[0]!;
      fireEvent.click(clearBtn); // First click → show confirmation
      const confirmBtn = screen.getAllByLabelText('Confirm clear canvas')[0]!;
      fireEvent.click(confirmBtn); // Second click → confirm
      expect(mockClear).toHaveBeenCalled();
      expect(mockReset).toHaveBeenCalled();
    });

    it('auto-dismisses confirmation after timeout', () => {
      vi.useFakeTimers();
      renderToolbar();
      const clearBtn = screen.getAllByLabelText('Clear Canvas')[0]!;
      fireEvent.click(clearBtn);
      expect(screen.getAllByText('Confirm?').length).toBeGreaterThanOrEqual(1);

      act(() => {
        vi.advanceTimersByTime(3500);
      });

      // Should revert to "Clear Canvas" button
      expect(screen.getAllByLabelText('Clear Canvas').length).toBeGreaterThanOrEqual(1);
      vi.useRealTimers();
    });

    it('dismisses confirmation on Escape key', () => {
      renderToolbar();
      const clearBtn = screen.getAllByLabelText('Clear Canvas')[0]!;
      fireEvent.click(clearBtn);
      expect(screen.getAllByText('Confirm?').length).toBeGreaterThanOrEqual(1);

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.getAllByLabelText('Clear Canvas').length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Settings ──────────────────────────────────────────────

  describe('settings', () => {
    it('calls onSettingsOpen when settings button clicked', () => {
      const onSettingsOpen = vi.fn();
      renderToolbar({ onSettingsOpen });
      const settingsBtn = screen.getAllByLabelText('Settings')[0]!;
      fireEvent.click(settingsBtn);
      expect(onSettingsOpen).toHaveBeenCalled();
    });
  });

  // ── Mobile Menu ───────────────────────────────────────────

  describe('mobile menu', () => {
    it('toggles mobile menu open and closed', () => {
      renderToolbar();
      const menuBtn = screen.getByLabelText('Open menu');
      fireEvent.click(menuBtn);
      expect(screen.getByLabelText('Close menu')).toBeDefined();

      fireEvent.click(screen.getByLabelText('Close menu'));
      expect(screen.getByLabelText('Open menu')).toBeDefined();
    });

    it('closes mobile menu on Escape key', () => {
      renderToolbar();
      fireEvent.click(screen.getByLabelText('Open menu'));
      expect(screen.getByLabelText('Close menu')).toBeDefined();

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.getByLabelText('Open menu')).toBeDefined();
    });
  });

  // ── Keyboard Navigation ───────────────────────────────────

  describe('keyboard navigation', () => {
    it('moves focus with ArrowRight', () => {
      renderToolbar();
      const toolbar = screen.getAllByRole('toolbar')[0]!;
      const buttons = Array.from(
        toolbar.querySelectorAll<HTMLButtonElement>('button:not([disabled])'),
      );

      if (buttons.length >= 2) {
        buttons[0]!.focus();
        fireEvent.keyDown(toolbar, { key: 'ArrowRight' });
        expect(document.activeElement).toBe(buttons[1]);
      }
    });

    it('moves focus with ArrowLeft', () => {
      renderToolbar();
      const toolbar = screen.getAllByRole('toolbar')[0]!;
      const buttons = Array.from(
        toolbar.querySelectorAll<HTMLButtonElement>('button:not([disabled])'),
      );

      if (buttons.length >= 2) {
        buttons[1]!.focus();
        fireEvent.keyDown(toolbar, { key: 'ArrowLeft' });
        expect(document.activeElement).toBe(buttons[0]);
      }
    });

    it('wraps focus from last to first with ArrowRight', () => {
      renderToolbar();
      const toolbar = screen.getAllByRole('toolbar')[0]!;
      const buttons = Array.from(
        toolbar.querySelectorAll<HTMLButtonElement>('button:not([disabled])'),
      );

      if (buttons.length >= 2) {
        buttons[buttons.length - 1]!.focus();
        fireEvent.keyDown(toolbar, { key: 'ArrowRight' });
        expect(document.activeElement).toBe(buttons[0]);
      }
    });

    it('moves to first button on Home key', () => {
      renderToolbar();
      const toolbar = screen.getAllByRole('toolbar')[0]!;
      const buttons = Array.from(
        toolbar.querySelectorAll<HTMLButtonElement>('button:not([disabled])'),
      );

      if (buttons.length >= 2) {
        buttons[1]!.focus();
        fireEvent.keyDown(toolbar, { key: 'Home' });
        expect(document.activeElement).toBe(buttons[0]);
      }
    });

    it('moves to last button on End key', () => {
      renderToolbar();
      const toolbar = screen.getAllByRole('toolbar')[0]!;
      const buttons = Array.from(
        toolbar.querySelectorAll<HTMLButtonElement>('button:not([disabled])'),
      );

      if (buttons.length >= 2) {
        buttons[0]!.focus();
        fireEvent.keyDown(toolbar, { key: 'End' });
        expect(document.activeElement).toBe(buttons[buttons.length - 1]);
      }
    });
  });

  // ── Tooltips ──────────────────────────────────────────────

  describe('tooltips', () => {
    it('renders tooltip elements for buttons', () => {
      renderToolbar();
      const tooltips = screen.getAllByRole('tooltip');
      expect(tooltips.length).toBeGreaterThan(0);
    });
  });
});
