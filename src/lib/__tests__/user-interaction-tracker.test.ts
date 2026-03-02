import { describe, it, expect } from 'vitest';
import { createUserInteractionTracker } from '@/lib/chat/user-interaction-tracker';

describe('UserInteractionTracker', () => {
  it('should start with empty state', () => {
    const tracker = createUserInteractionTracker();
    expect(tracker.getEventCount()).toBe(0);
    expect(tracker.getTimeline()).toHaveLength(0);
  });

  it('should track a send event', () => {
    const tracker = createUserInteractionTracker();
    tracker.track('send');
    expect(tracker.getEventCount('send')).toBe(1);
    expect(tracker.getEventCount()).toBe(1);
  });

  it('should track scroll events', () => {
    const tracker = createUserInteractionTracker();
    tracker.track('scroll');
    tracker.track('scroll');
    expect(tracker.getEventCount('scroll')).toBe(2);
  });

  it('should track thread switches', () => {
    const tracker = createUserInteractionTracker();
    tracker.track('thread_switch', { from: 'a', to: 'b' });
    expect(tracker.getEventCount('thread_switch')).toBe(1);
    expect(tracker.getTimeline()[0].metadata).toEqual({ from: 'a', to: 'b' });
  });

  it('should compute interaction rate', () => {
    const tracker = createUserInteractionTracker();
    tracker.track('send');
    tracker.track('click');
    const rate = tracker.getInteractionRate();
    expect(rate).toBeGreaterThanOrEqual(0);
  });

  it('should return 0 rate for single event', () => {
    const tracker = createUserInteractionTracker();
    tracker.track('send');
    expect(tracker.getInteractionRate()).toBe(0);
  });

  it('should compute session duration', () => {
    const tracker = createUserInteractionTracker();
    tracker.track('send');
    tracker.track('click');
    expect(tracker.getSessionDuration()).toBeGreaterThanOrEqual(0);
  });

  it('should compute engagement score', () => {
    const tracker = createUserInteractionTracker();
    tracker.track('send');
    const score = tracker.getEngagementScore();
    expect(score).toBe(100);
  });

  it('should produce a summary', () => {
    const tracker = createUserInteractionTracker();
    tracker.track('send');
    tracker.track('scroll');
    tracker.track('click');
    const summary = tracker.summary();
    expect(summary.totalEvents).toBe(3);
    expect(summary.eventCounts.send).toBe(1);
    expect(summary.eventCounts.scroll).toBe(1);
    expect(summary.eventCounts.click).toBe(1);
  });

  it('should reset all data', () => {
    const tracker = createUserInteractionTracker();
    tracker.track('send');
    tracker.track('scroll');
    tracker.reset();
    expect(tracker.getEventCount()).toBe(0);
    expect(tracker.getEngagementScore()).toBe(0);
  });
});
