import { describe, it, expect, vi } from 'vitest';
import { createChatDiagnostics } from '../client/chat-diagnostics';

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe('ChatDiagnostics', () => {
  it('markSend records sendTs for a message ID', () => {
    const diag = createChatDiagnostics();
    diag.markSend('msg-1');
    const timing = diag.timings.get('msg-1');
    expect(timing).toBeDefined();
    expect(timing!.sendTs).toBeGreaterThan(0);
  });

  it('markFirstChunk computes deliveryMs correctly', async () => {
    const diag = createChatDiagnostics();
    diag.markSend('msg-2');
    const sendTs = diag.timings.get('msg-2')!.sendTs;
    await delay(20);
    diag.markFirstChunk('msg-2');
    const timing = diag.timings.get('msg-2')!;
    expect(timing.firstChunkTs).toBeGreaterThan(sendTs);
    expect(timing.deliveryMs).toBeGreaterThanOrEqual(10);
    expect(timing.deliveryMs).toBe(timing.firstChunkTs! - timing.sendTs);
  });

  it('markRendered computes renderMs correctly', async () => {
    const diag = createChatDiagnostics();
    diag.markSend('msg-3');
    await delay(5);
    diag.markFirstChunk('msg-3');
    const chunkTs = diag.timings.get('msg-3')!.firstChunkTs!;
    await delay(10);
    diag.markRendered('msg-3');
    const timing = diag.timings.get('msg-3')!;
    expect(timing.renderTs).toBeGreaterThan(chunkTs);
    expect(timing.renderMs).toBe(timing.renderTs! - timing.firstChunkTs!);
  });

  it('markFirstChunk without prior markSend is a no-op', () => {
    const diag = createChatDiagnostics();
    expect(() => diag.markFirstChunk('unknown')).not.toThrow();
    expect(diag.timings.has('unknown')).toBe(false);
  });

  it('snapshot computes average delivery time over multiple messages', async () => {
    const diag = createChatDiagnostics();
    const delays = [10, 20, 30];
    for (let i = 0; i < delays.length; i++) {
      diag.markSend(`msg-${i}`);
      await delay(delays[i]);
      diag.markFirstChunk(`msg-${i}`);
    }
    const snap = diag.snapshot();
    const actualDeliveries = delays.map((_, i) => diag.timings.get(`msg-${i}`)!.deliveryMs!);
    const expectedAvg = actualDeliveries.reduce((s, v) => s + v, 0) / actualDeliveries.length;
    expect(snap.avgDeliveryMs).toBeCloseTo(expectedAvg, 5);
  });

  it('snapshot computes p95 correctly with 20+ data points', async () => {
    const diag = createChatDiagnostics();
    for (let i = 0; i < 25; i++) {
      diag.markSend(`msg-${i}`);
      await delay(1 + i);
      diag.markFirstChunk(`msg-${i}`);
    }
    const snap = diag.snapshot();
    const deliveries = Array.from(diag.timings.values())
      .map((t) => t.deliveryMs!)
      .filter((v) => v != null)
      .sort((a, b) => a - b);
    const median = deliveries[Math.floor(deliveries.length / 2)];
    const max = deliveries[deliveries.length - 1];
    expect(snap.p95DeliveryMs).toBeGreaterThanOrEqual(median);
    expect(snap.p95DeliveryMs).toBeLessThanOrEqual(max);
  });

  it('snapshot returns zeroes when no timings exist', () => {
    const diag = createChatDiagnostics();
    const snap = diag.snapshot();
    expect(snap.avgDeliveryMs).toBe(0);
    expect(snap.avgRenderMs).toBe(0);
    expect(snap.p95DeliveryMs).toBe(0);
    expect(snap.queueDepth).toBe(0);
    expect(snap.totalMessages).toBe(0);
    expect(snap.recentTimings).toEqual([]);
  });

  it('setQueueDepth updates queueDepth in snapshot', () => {
    const diag = createChatDiagnostics();
    diag.setQueueDepth(7);
    expect(diag.snapshot().queueDepth).toBe(7);
    diag.setQueueDepth(0);
    expect(diag.snapshot().queueDepth).toBe(0);
  });

  it('timings are capped at 50 entries (oldest evicted)', () => {
    const diag = createChatDiagnostics();
    for (let i = 0; i < 60; i++) {
      diag.markSend(`msg-${i}`);
    }
    expect(diag.timings.size).toBeLessThanOrEqual(50);
    expect(diag.timings.has('msg-0')).toBe(false);
    expect(diag.timings.has('msg-59')).toBe(true);
  });

  it('snapshot recentTimings returns entries in chronological order', () => {
    const diag = createChatDiagnostics();
    for (let i = 0; i < 5; i++) {
      diag.markSend(`msg-${i}`);
    }
    const snap = diag.snapshot();
    for (let i = 1; i < snap.recentTimings.length; i++) {
      expect(snap.recentTimings[i].sendTs).toBeGreaterThanOrEqual(
        snap.recentTimings[i - 1].sendTs,
      );
    }
  });
});
