// User Interaction Tracker — analytics for user behavior
export type InteractionType = 'send' | 'scroll' | 'thread_switch' | 'click';

export interface InteractionEvent {
  type: InteractionType;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface InteractionSummary {
  totalEvents: number;
  eventCounts: Record<InteractionType, number>;
  interactionRate: number;
  sessionDurationMs: number;
  engagementScore: number;
}

export interface UserInteractionTracker {
  track(type: InteractionType, metadata?: Record<string, unknown>): void;
  getEventCount(type?: InteractionType): number;
  getInteractionRate(): number;
  getSessionDuration(): number;
  getEngagementScore(): number;
  getTimeline(): readonly InteractionEvent[];
  summary(): InteractionSummary;
  reset(): void;
}

export function createUserInteractionTracker(): UserInteractionTracker {
  let events: InteractionEvent[] = [];

  function countByType(type: InteractionType): number {
    return events.filter(e => e.type === type).length;
  }

  return {
    track(type, metadata): void {
      events.push({ type, timestamp: Date.now(), metadata });
    },

    getEventCount(type?): number {
      if (type) return countByType(type);
      return events.length;
    },

    getInteractionRate(): number {
      if (events.length < 2) return 0;
      const durationSec = (events[events.length - 1].timestamp - events[0].timestamp) / 1000;
      return durationSec > 0 ? events.length / durationSec : 0;
    },

    getSessionDuration(): number {
      if (events.length < 2) return 0;
      return events[events.length - 1].timestamp - events[0].timestamp;
    },

    getEngagementScore(): number {
      if (events.length === 0) return 0;
      const typeWeights: Record<InteractionType, number> = {
        send: 3,
        thread_switch: 2,
        click: 1,
        scroll: 0.5,
      };
      const weightedSum = events.reduce((s, e) => s + (typeWeights[e.type] ?? 1), 0);
      const maxPossible = events.length * 3;
      return Math.min(100, (weightedSum / maxPossible) * 100);
    },

    getTimeline(): readonly InteractionEvent[] {
      return events;
    },

    summary(): InteractionSummary {
      return {
        totalEvents: events.length,
        eventCounts: {
          send: countByType('send'),
          scroll: countByType('scroll'),
          thread_switch: countByType('thread_switch'),
          click: countByType('click'),
        },
        interactionRate: this.getInteractionRate(),
        sessionDurationMs: this.getSessionDuration(),
        engagementScore: this.getEngagementScore(),
      };
    },

    reset(): void {
      events = [];
    },
  };
}
