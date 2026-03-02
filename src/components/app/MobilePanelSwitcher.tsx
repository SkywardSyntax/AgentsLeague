import { useCallback, useEffect, useRef } from 'react';

type PanelType = 'whiteboard' | 'chat';

interface MobilePanelSwitcherProps {
  activePanel: PanelType;
  onSwitch: (panel: PanelType) => void;
}

const PANELS: PanelType[] = ['whiteboard', 'chat'];

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
    (panel: PanelType) => {
      onSwitch(panel);
    },
    [onSwitch],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const currentIndex = PANELS.indexOf(activePanel);
      let nextIndex: number | null = null;

      if (e.key === 'ArrowRight') {
        nextIndex = (currentIndex + 1) % PANELS.length;
      } else if (e.key === 'ArrowLeft') {
        nextIndex = (currentIndex - 1 + PANELS.length) % PANELS.length;
      } else if (e.key === 'Home') {
        nextIndex = 0;
      } else if (e.key === 'End') {
        nextIndex = PANELS.length - 1;
      }

      if (nextIndex !== null && nextIndex !== currentIndex) {
        e.preventDefault();
        onSwitch(PANELS[nextIndex]!);
      }
    },
    [activePanel, onSwitch],
  );

  return (
    <div role="tablist" aria-label="Panel switcher" onKeyDown={handleKeyDown} className="fixed bottom-4 left-1/2 z-30 flex -translate-x-1/2 gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/95 p-1 shadow-lg backdrop-blur md:hidden">
      <button
        type="button"
        role="tab"
        aria-selected={activePanel === 'whiteboard'}
        aria-controls="panel-whiteboard"
        tabIndex={activePanel === 'whiteboard' ? 0 : -1}
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
        aria-controls="panel-chat"
        tabIndex={activePanel === 'chat' ? 0 : -1}
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
