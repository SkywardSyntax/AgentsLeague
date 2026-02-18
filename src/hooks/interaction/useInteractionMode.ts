'use client';

import { useCallback } from 'react';
import { type InteractionMode } from '@/types/interaction';
import { useConversationStore } from '@/stores/conversation-store';

/**
 * Hook for switching between TEXT and VOICE interaction modes.
 * Clears processing state on switch.
 */
export function useInteractionMode() {
  const mode = useConversationStore((s) => s.mode);
  const setMode = useConversationStore((s) => s.setMode);
  const setProcessing = useConversationStore((s) => s.setProcessing);

  const switchMode = useCallback(
    (newMode: InteractionMode) => {
      if (newMode === mode) return;
      setProcessing(false);
      setMode(newMode);
    },
    [mode, setMode, setProcessing],
  );

  return { mode, switchMode } as const;
}
