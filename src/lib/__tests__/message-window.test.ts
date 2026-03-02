import { describe, expect, it } from 'vitest';
import { computeMessageWindow, isItemVisible } from '@/lib/chat/message-window';

describe('message-window', () => {
  it('100 messages and viewport 600px returns ~15 visible items (rowHeight=40)', () => {
    const result = computeMessageWindow({
      messageCount: 100,
      viewportHeight: 600,
      estimatedRowHeight: 40,
      scrollOffset: 0,
    });
    expect(result.endIndex - result.startIndex).toBe(15);
  });

  it('scroll offset 0 returns startIndex=0', () => {
    const result = computeMessageWindow({
      messageCount: 100,
      viewportHeight: 400,
      estimatedRowHeight: 40,
      scrollOffset: 0,
    });
    expect(result.startIndex).toBe(0);
  });

  it('scroll offset at bottom returns endIndex equal to message count', () => {
    const result = computeMessageWindow({
      messageCount: 100,
      viewportHeight: 400,
      estimatedRowHeight: 40,
      scrollOffset: (100 * 40) - 400, // scroll to bottom
    });
    expect(result.endIndex).toBe(100);
  });

  it('totalHeight equals messageCount * estimatedRowHeight', () => {
    const result = computeMessageWindow({
      messageCount: 50,
      viewportHeight: 300,
      estimatedRowHeight: 25,
      scrollOffset: 0,
    });
    expect(result.totalHeight).toBe(50 * 25);
  });

  it('offsetTop equals startIndex * estimatedRowHeight', () => {
    const result = computeMessageWindow({
      messageCount: 100,
      viewportHeight: 400,
      estimatedRowHeight: 40,
      scrollOffset: 200,
    });
    expect(result.offsetTop).toBe(result.startIndex * 40);
  });

  it('overscan of 5 extends window by 5 in each direction (clamped)', () => {
    const without = computeMessageWindow({
      messageCount: 100,
      viewportHeight: 400,
      estimatedRowHeight: 40,
      scrollOffset: 800,
    });
    const withOverscan = computeMessageWindow({
      messageCount: 100,
      viewportHeight: 400,
      estimatedRowHeight: 40,
      scrollOffset: 800,
      overscan: 5,
    });
    expect(withOverscan.startIndex).toBe(Math.max(0, without.startIndex - 5));
    expect(withOverscan.endIndex).toBe(Math.min(100, without.endIndex + 5));
  });

  it('empty message list returns startIndex=0, endIndex=0, totalHeight=0', () => {
    const result = computeMessageWindow({
      messageCount: 0,
      viewportHeight: 400,
      estimatedRowHeight: 40,
      scrollOffset: 0,
    });
    expect(result.startIndex).toBe(0);
    expect(result.endIndex).toBe(0);
    expect(result.totalHeight).toBe(0);
  });

  it('single message returns startIndex=0, endIndex=1', () => {
    const result = computeMessageWindow({
      messageCount: 1,
      viewportHeight: 400,
      estimatedRowHeight: 40,
      scrollOffset: 100,
    });
    expect(result.startIndex).toBe(0);
    expect(result.endIndex).toBe(1);
  });

  it('negative scroll offset clamps to startIndex=0', () => {
    const result = computeMessageWindow({
      messageCount: 100,
      viewportHeight: 400,
      estimatedRowHeight: 40,
      scrollOffset: -500,
    });
    expect(result.startIndex).toBe(0);
  });

  it('isItemVisible returns true for items within window, false outside', () => {
    const win = computeMessageWindow({
      messageCount: 100,
      viewportHeight: 400,
      estimatedRowHeight: 40,
      scrollOffset: 400,
    });
    expect(isItemVisible(win.startIndex, win)).toBe(true);
    expect(isItemVisible(win.endIndex - 1, win)).toBe(true);
    expect(isItemVisible(win.endIndex, win)).toBe(false);
    expect(isItemVisible(Math.max(0, win.startIndex - 1), win)).toBe(
      win.startIndex === 0 ? true : false,
    );
  });
});
