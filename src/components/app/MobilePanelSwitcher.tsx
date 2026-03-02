import { useCallback, useEffect, useRef } from 'react';

interface MobilePanelSwitcherProps {
  activePanel: 'whiteboard' | 'chat';
  onSwitch: (panel: 'whiteboard' | 'chat') => void;
}

export function MobilePanelSwitcher({ activePanel, onSwitch }: MobilePanelSwitcherProps) {
  const isInitialMount = useRef(true);
  const prevPanelRef = useRef(activePanel);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (prevPanelRef.current === activePanel) return;
    prevPanelRef.current = activePanel;

    // Focus the newly visible panel's container
    requestAnimationFrame(() => {
      const selector =
        activePanel === 'whiteboard'
          ? '[data-testid="whiteboard-canvas"]'
          : '[data-testid="chat-panel"]';
      const target = document.querySelector<HTMLElement>(selector);
      target?.focus();
    });
  }, [activePanel]);

  const switchPanel = useCallback(
    (panel: 'whiteboard' | 'chat') => {
      onSwitch(panel);
    },
    [onSwitch],
  );

  return (
    <div role="tablist" aria-label="Panel switcher" className="fixed bottom-4 left-1/2 z-30 flex -translate-x-1/2 gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/95 p-1 shadow-lg backdrop-blur md:hidden">
      <button
        type="button"
        role="tab"
        aria-selected={activePanel === 'whiteboard'}
        onClick={() => switchPanel('whiteboard')}
        className={`btn-press rounded-full px-4 py-1.5 text-xs font-medium transition ${
          activePanel === 'whiteboard'
            ? 'bg-[var(--color-accent)] text-white'
            : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-soft)]'
        }`}
      >
        Canvas
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activePanel === 'chat'}
        onClick={() => switchPanel('chat')}
        className={`btn-press rounded-full px-4 py-1.5 text-xs font-medium transition ${
          activePanel === 'chat'
            ? 'bg-[var(--color-accent)] text-white'
            : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-soft)]'
        }`}
      >
        Chat
      </button>
    </div>
  );
}
