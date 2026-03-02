export interface StreamHealthSnapshot {
  connectionUptimeMs: number;
  reconnectCount: number;
  totalBytesReceived: number;
  messagesParsed: number;
  messagesInvalid: number;
  lastConnectedAt: number | null;
  lastDisconnectedAt: number | null;
  currentState: 'disconnected' | 'connecting' | 'connected';
}

export interface StreamHealthTracker {
  onConnect(): void;
  onDisconnect(): void;
  onReconnect(): void;
  onBytesReceived(bytes: number): void;
  onMessageParsed(): void;
  onMessageInvalid(): void;
  snapshot(): StreamHealthSnapshot;
  reset(): void;
}

export function createStreamHealthTracker(): StreamHealthTracker {
  let currentState: StreamHealthSnapshot['currentState'] = 'disconnected';
  let reconnectCount = 0;
  let totalBytesReceived = 0;
  let messagesParsed = 0;
  let messagesInvalid = 0;
  let lastConnectedAt: number | null = null;
  let lastDisconnectedAt: number | null = null;
  let accumulatedUptimeMs = 0;
  let connectStartedAt: number | null = null;

  const tracker: StreamHealthTracker = {
    onConnect() {
      currentState = 'connected';
      connectStartedAt = performance.now();
      lastConnectedAt = connectStartedAt;
    },

    onDisconnect() {
      if (currentState === 'connected' && connectStartedAt != null) {
        accumulatedUptimeMs += performance.now() - connectStartedAt;
        connectStartedAt = null;
      }
      currentState = 'disconnected';
      lastDisconnectedAt = performance.now();
    },

    onReconnect() {
      reconnectCount++;
    },

    onBytesReceived(bytes: number) {
      totalBytesReceived += bytes;
    },

    onMessageParsed() {
      messagesParsed++;
    },

    onMessageInvalid() {
      messagesInvalid++;
    },

    snapshot(): StreamHealthSnapshot {
      let connectionUptimeMs = accumulatedUptimeMs;
      if (currentState === 'connected' && connectStartedAt != null) {
        connectionUptimeMs += performance.now() - connectStartedAt;
      }

      return Object.freeze({
        connectionUptimeMs,
        reconnectCount,
        totalBytesReceived,
        messagesParsed,
        messagesInvalid,
        lastConnectedAt,
        lastDisconnectedAt,
        currentState,
      });
    },

    reset() {
      currentState = 'disconnected';
      reconnectCount = 0;
      totalBytesReceived = 0;
      messagesParsed = 0;
      messagesInvalid = 0;
      lastConnectedAt = null;
      lastDisconnectedAt = null;
      accumulatedUptimeMs = 0;
      connectStartedAt = null;
    },
  };

  return tracker;
}
