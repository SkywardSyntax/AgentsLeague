import { describe, it, expect, vi } from 'vitest';
import { createEnhancementDetector } from '../client/progressive-enhance';

describe('progressive-enhance', () => {
  it('isEnhanced returns false before hydrate is called', () => {
    const detector = createEnhancementDetector();
    expect(detector.isEnhanced()).toBe(false);
  });

  it('isEnhanced returns true after hydrate is called', () => {
    const detector = createEnhancementDetector();
    detector.hydrate();
    expect(detector.isEnhanced()).toBe(true);
  });

  it('onEnhance callback fires when hydrate transitions to enhanced', () => {
    const detector = createEnhancementDetector();
    const cb = vi.fn();
    detector.onEnhance(cb);
    detector.hydrate();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('onEnhance does not fire if hydrate called twice', () => {
    const detector = createEnhancementDetector();
    const cb = vi.fn();
    detector.onEnhance(cb);
    detector.hydrate();
    detector.hydrate();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('features returns js: true in a JS-capable environment', () => {
    const detector = createEnhancementDetector();
    const f = detector.features();
    expect(f.js).toBe(true);
  });

  it('features returns intersection: false when IntersectionObserver is undefined', () => {
    const detector = createEnhancementDetector();
    const f = detector.features();
    // In Node/vitest environment, IntersectionObserver is not defined
    expect(f.intersection).toBe(false);
  });

  it('gracefulProp returns base before hydration', () => {
    const detector = createEnhancementDetector();
    const result = detector.gracefulProp('enhanced-val', 'base-val');
    expect(result).toBe('base-val');
  });

  it('gracefulProp returns enhanced after hydration', () => {
    const detector = createEnhancementDetector();
    detector.hydrate();
    const result = detector.gracefulProp('enhanced-val', 'base-val');
    expect(result).toBe('enhanced-val');
  });

  it('noScriptContent wraps content in a structure containing the HTML string', () => {
    const detector = createEnhancementDetector();
    const result = detector.noScriptContent('<p>Fallback</p>');
    expect(result.tag).toBe('noscript');
    expect(result.html).toBe('<p>Fallback</p>');
  });

  it('multiple onEnhance listeners all fire on hydration', () => {
    const detector = createEnhancementDetector();
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const cb3 = vi.fn();
    detector.onEnhance(cb1);
    detector.onEnhance(cb2);
    detector.onEnhance(cb3);
    detector.hydrate();
    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);
    expect(cb3).toHaveBeenCalledTimes(1);
  });
});
