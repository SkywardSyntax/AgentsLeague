import { describe, it, expect } from 'vitest';
import { createStreamHealthTracker } from '../client/stream-health';

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe('StreamHealthTracker', () => {
  it('initial snapshot has all zeroes and state disconnected', () => {
    const tracker = createStreamHealthTracker();
    const snap = tracker.snapshot();
    expect(snap.connectionUptimeMs).toBe(0);
    expect(snap.reconnectCount).toBe(0);
    expect(snap.totalBytesReceived).toBe(0);
    expect(snap.messagesParsed).toBe(0);
    expect(snap.messagesInvalid).toBe(0);
    expect(snap.lastConnectedAt).toBeNull();
    expect(snap.lastDisconnectedAt).toBeNull();
    expect(snap.currentState).toBe('disconnected');
  });

  it('onConnect sets state to connected and records timestamp', () => {
    const tracker = createStreamHealthTracker();
    tracker.onConnect();
    const snap = tracker.snapshot();
    expect(snap.currentState).toBe('connected');
    expect(snap.lastConnectedAt).toBeGreaterThan(0);
  });

  it('onDisconnect sets state to disconnected and records timestamp', () => {
    const tracker = createStreamHealthTracker();
    tracker.onConnect();
    tracker.onDisconnect();
    const snap = tracker.snapshot();
    expect(snap.currentState).toBe('disconnected');
    expect(snap.lastDisconnectedAt).toBeGreaterThan(0);
  });

  it('connection uptime accumulates across connect/disconnect cycles', async () => {
    const tracker = createStreamHealthTracker();
    tracker.onConnect();
    await delay(50);
    tracker.onDisconnect();
    tracker.onConnect();
    await delay(50);
    tracker.onDisconnect();
    const snap = tracker.snapshot();
    expect(snap.connectionUptimeMs).toBeGreaterThanOrEqual(80);
  });

  it('onReconnect increments reconnect count', () => {
    const tracker = createStreamHealthTracker();
    expect(tracker.snapshot().reconnectCount).toBe(0);
    tracker.onReconnect();
    expect(tracker.snapshot().reconnectCount).toBe(1);
    tracker.onReconnect();
    expect(tracker.snapshot().reconnectCount).toBe(2);
  });

  it('onBytesReceived accumulates total bytes', () => {
    const tracker = createStreamHealthTracker();
    tracker.onBytesReceived(100);
    tracker.onBytesReceived(200);
    expect(tracker.snapshot().totalBytesReceived).toBe(300);
  });

  it('onMessageParsed and onMessageInvalid count independently', () => {
    const tracker = createStreamHealthTracker();
    tracker.onMessageParsed();
    tracker.onMessageParsed();
    tracker.onMessageParsed();
    tracker.onMessageInvalid();
    const snap = tracker.snapshot();
    expect(snap.messagesParsed).toBe(3);
    expect(snap.messagesInvalid).toBe(1);
  });

  it('reset clears all counters and sets state to disconnected', () => {
    const tracker = createStreamHealthTracker();
    tracker.onConnect();
    tracker.onReconnect();
    tracker.onBytesReceived(500);
    tracker.onMessageParsed();
    tracker.onMessageInvalid();
    tracker.onDisconnect();
    tracker.reset();
    const snap = tracker.snapshot();
    expect(snap.connectionUptimeMs).toBe(0);
    expect(snap.reconnectCount).toBe(0);
    expect(snap.totalBytesReceived).toBe(0);
    expect(snap.messagesParsed).toBe(0);
    expect(snap.messagesInvalid).toBe(0);
    expect(snap.lastConnectedAt).toBeNull();
    expect(snap.lastDisconnectedAt).toBeNull();
    expect(snap.currentState).toBe('disconnected');
  });

  it('multiple rapid connect/disconnect cycles produce correct uptime', async () => {
    const tracker = createStreamHealthTracker();
    for (let i = 0; i < 10; i++) {
      tracker.onConnect();
      await delay(5);
      tracker.onDisconnect();
    }
    const snap = tracker.snapshot();
    expect(snap.connectionUptimeMs).toBeGreaterThanOrEqual(30);
  });

  it('snapshot returns a frozen object (mutations do not affect tracker)', () => {
    const tracker = createStreamHealthTracker();
    tracker.onBytesReceived(100);
    const snap = tracker.snapshot();
    expect(() => {
      (snap as Record<string, unknown>).totalBytesReceived = 999;
    }).toThrow();
    expect(tracker.snapshot().totalBytesReceived).toBe(100);
  });
});
