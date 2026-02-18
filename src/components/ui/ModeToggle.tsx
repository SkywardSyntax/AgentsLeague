'use client';

import { useCallback, useRef } from 'react';
import { InteractionMode } from '@/types/interaction';
import { useInteractionMode } from '@/hooks/interaction/useInteractionMode';
import { useConversationStore } from '@/stores/conversation-store';

// ── Props ───────────────────────────────────────────────────────

interface ModeToggleProps {
  onChange?: (mode: InteractionMode) => void;
}

// ── Keyboard icon (inline SVG, no external deps) ────────────────

function KeyboardIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M8 16h8" />
    </svg>
  );
}

function MicIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  );
}

// ── ModeToggle ──────────────────────────────────────────────────

export default function ModeToggle({ onChange }: ModeToggleProps) {
  const { mode, switchMode } = useInteractionMode();
  const messages = useConversationStore((s) => s.messages);
  const containerRef = useRef<HTMLDivElement>(null);

  const isVoice = mode === InteractionMode.VOICE;
  const hasConversation = messages.length > 0;

  const handleSwitch = useCallback(
    (target: InteractionMode) => {
      if (target === mode) return;

      if (hasConversation) {
        const confirmed = window.confirm(
          'Switching modes will not clear your conversation, but the input context may change. Continue?',
        );
        if (!confirmed) return;
      }

      switchMode(target);
      onChange?.(target);
    },
    [mode, hasConversation, switchMode, onChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const target =
        e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? InteractionMode.TEXT
          : e.key === 'ArrowRight' || e.key === 'ArrowDown'
            ? InteractionMode.VOICE
            : null;

      if (target) {
        e.preventDefault();
        handleSwitch(target);
      }
    },
    [handleSwitch],
  );

  return (
    <div
      ref={containerRef}
      role="radiogroup"
      aria-label="Interaction mode"
      className="relative flex h-8 w-[152px] rounded-full bg-surface-raised p-0.5 text-xs font-medium shadow-inner transition-colors duration-fast"
      onKeyDown={handleKeyDown}
    >
      {/* Sliding indicator */}
      <span
        aria-hidden="true"
        className="absolute top-0.5 left-0.5 h-7 w-[74px] rounded-full bg-accent shadow-sm transition-transform duration-normal ease-default"
        style={{ transform: isVoice ? 'translateX(calc(100% - 2px))' : 'translateX(0)' }}
      />

      {/* Text option */}
      <button
        type="button"
        role="radio"
        aria-checked={!isVoice}
        aria-label="Text mode"
        tabIndex={!isVoice ? 0 : -1}
        onClick={() => handleSwitch(InteractionMode.TEXT)}
        className={`relative z-10 flex flex-1 items-center justify-center gap-1.5 rounded-full transition-colors duration-fast ${
          !isVoice
            ? 'text-content-inverse'
            : 'text-content-secondary hover:text-content-primary'
        }`}
      >
        <KeyboardIcon className="shrink-0" />
        <span>Text</span>
      </button>

      {/* Voice option */}
      <button
        type="button"
        role="radio"
        aria-checked={isVoice}
        aria-label="Voice mode"
        tabIndex={isVoice ? 0 : -1}
        onClick={() => handleSwitch(InteractionMode.VOICE)}
        className={`relative z-10 flex flex-1 items-center justify-center gap-1.5 rounded-full transition-colors duration-fast ${
          isVoice
            ? 'text-content-inverse'
            : 'text-content-secondary hover:text-content-primary'
        }`}
      >
        <MicIcon className="shrink-0" />
        <span>Voice</span>
      </button>
    </div>
  );
}
