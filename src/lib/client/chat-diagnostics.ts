export interface MessageTiming {
  messageId: string;
  sendTs: number;
  firstChunkTs?: number;
  renderTs?: number;
  deliveryMs?: number;
  renderMs?: number;
}

export interface ChatDiagnosticsSnapshot {
  avgDeliveryMs: number;
  avgRenderMs: number;
  p95DeliveryMs: number;
  queueDepth: number;
  totalMessages: number;
  recentTimings: MessageTiming[];
}

export interface ChatDiagnostics {
  timings: Map<string, MessageTiming>;
  queueDepth: number;
  totalMessages: number;
  markSend(messageId: string): void;
  markFirstChunk(messageId: string): void;
  markRendered(messageId: string): void;
  setQueueDepth(depth: number): void;
  snapshot(): ChatDiagnosticsSnapshot;
}

const MAX_TIMINGS = 50;

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

export function createChatDiagnostics(): ChatDiagnostics {
  const insertionOrder: string[] = [];

  const diag: ChatDiagnostics = {
    timings: new Map<string, MessageTiming>(),
    queueDepth: 0,
    totalMessages: 0,

    markSend(messageId: string) {
      if (diag.timings.size >= MAX_TIMINGS) {
        const oldest = insertionOrder.shift();
        if (oldest) diag.timings.delete(oldest);
      }
      const timing: MessageTiming = {
        messageId,
        sendTs: performance.now(),
      };
      diag.timings.set(messageId, timing);
      insertionOrder.push(messageId);
      diag.totalMessages++;
    },

    markFirstChunk(messageId: string) {
      const timing = diag.timings.get(messageId);
      if (!timing) return;
      timing.firstChunkTs = performance.now();
      timing.deliveryMs = timing.firstChunkTs - timing.sendTs;
    },

    markRendered(messageId: string) {
      const timing = diag.timings.get(messageId);
      if (!timing || timing.firstChunkTs == null) return;
      timing.renderTs = performance.now();
      timing.renderMs = timing.renderTs - timing.firstChunkTs;
    },

    setQueueDepth(depth: number) {
      diag.queueDepth = depth;
    },

    snapshot(): ChatDiagnosticsSnapshot {
      const entries = Array.from(diag.timings.values());
      const deliveries = entries
        .map((t) => t.deliveryMs)
        .filter((v): v is number => v != null)
        .sort((a, b) => a - b);
      const renders = entries
        .map((t) => t.renderMs)
        .filter((v): v is number => v != null);

      const avgDeliveryMs =
        deliveries.length > 0
          ? deliveries.reduce((s, v) => s + v, 0) / deliveries.length
          : 0;
      const avgRenderMs =
        renders.length > 0
          ? renders.reduce((s, v) => s + v, 0) / renders.length
          : 0;
      const p95DeliveryMs = percentile(deliveries, 95);

      const recentTimings = entries.slice().sort((a, b) => a.sendTs - b.sendTs);

      return {
        avgDeliveryMs,
        avgRenderMs,
        p95DeliveryMs,
        queueDepth: diag.queueDepth,
        totalMessages: diag.totalMessages,
        recentTimings,
      };
    },
  };

  return diag;
}
