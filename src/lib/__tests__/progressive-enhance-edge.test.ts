import { describe, expect, it } from 'vitest';
import { createEnhancementDetector } from '@/lib/client/progressive-enhance';

describe('progressive-enhance edge cases', () => {
  it('isEnhanced returns false before hydrate', () => {
    const det = createEnhancementDetector();
    expect(det.isEnhanced()).toBe(false);
  });

  it('hydrate sets enhanced to true', () => {
    const det = createEnhancementDetector();
    det.hydrate();
    expect(det.isEnhanced()).toBe(true);
  });

  it('hydrate triggers all registered listeners', () => {
    const det = createEnhancementDetector();
    const calls: number[] = [];
    det.onEnhance(() => calls.push(1));
    det.onEnhance(() => calls.push(2));
    det.hydrate();
    expect(calls).toEqual([1, 2]);
  });

  it('hydrate called twice is idempotent — listeners fire only once', () => {
    const det = createEnhancementDetector();
    let count = 0;
    det.onEnhance(() => count++);
    det.hydrate();
    det.hydrate();
    expect(count).toBe(1);
  });

  it('gracefulProp returns base value before hydrate', () => {
    const det = createEnhancementDetector();
    expect(det.gracefulProp('enhanced', 'base')).toBe('base');
  });

  it('gracefulProp returns enhanced value after hydrate', () => {
    const det = createEnhancementDetector();
    det.hydrate();
    expect(det.gracefulProp('enhanced', 'base')).toBe('enhanced');
  });

  it('noScriptContent wraps HTML correctly', () => {
    const det = createEnhancementDetector();
    const result = det.noScriptContent('<p>fallback</p>');
    expect(result.tag).toBe('noscript');
    expect(result.html).toBe('<p>fallback</p>');
  });

  it('features returns FeatureMap with js=true in Node environment', () => {
    const det = createEnhancementDetector();
    const f = det.features();
    expect(f.js).toBe(true);
  });

  it('onEnhance with multiple callbacks all fire in order', () => {
    const det = createEnhancementDetector();
    const order: string[] = [];
    det.onEnhance(() => order.push('first'));
    det.onEnhance(() => order.push('second'));
    det.onEnhance(() => order.push('third'));
    det.hydrate();
    expect(order).toEqual(['first', 'second', 'third']);
  });

  it('listener registered after hydrate does not fire', () => {
    const det = createEnhancementDetector();
    det.hydrate();
    let fired = false;
    det.onEnhance(() => { fired = true; });
    // No second hydrate call, so the late listener should not fire
    expect(fired).toBe(false);
  });
});
