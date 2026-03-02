export interface MessageWindowResult {
  startIndex: number;
  endIndex: number;
  offsetTop: number;
  totalHeight: number;
}

export interface MessageWindowOptions {
  messageCount: number;
  viewportHeight: number;
  estimatedRowHeight: number;
  scrollOffset: number;
  overscan?: number;
}

export function computeMessageWindow(options: MessageWindowOptions): MessageWindowResult {
  const { messageCount, viewportHeight, estimatedRowHeight, scrollOffset, overscan = 0 } = options;

  if (messageCount === 0 || estimatedRowHeight <= 0) {
    return { startIndex: 0, endIndex: 0, offsetTop: 0, totalHeight: 0 };
  }

  const totalHeight = messageCount * estimatedRowHeight;
  const clampedOffset = Math.max(0, scrollOffset);

  const rawStart = Math.min(
    Math.floor(clampedOffset / estimatedRowHeight),
    Math.max(0, messageCount - 1),
  );
  const visibleCount = Math.ceil(viewportHeight / estimatedRowHeight);
  const rawEnd = Math.min(rawStart + visibleCount, messageCount);

  const startIndex = Math.max(0, rawStart - overscan);
  const endIndex = Math.min(messageCount, rawEnd + overscan);
  const offsetTop = startIndex * estimatedRowHeight;

  return { startIndex, endIndex, offsetTop, totalHeight };
}

export function isItemVisible(
  index: number,
  window: MessageWindowResult,
): boolean {
  return index >= window.startIndex && index < window.endIndex;
}
