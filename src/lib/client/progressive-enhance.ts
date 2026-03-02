export interface FeatureMap {
  js: boolean;
  intersection: boolean;
  resize: boolean;
  mutationObserver: boolean;
}

export interface EnhancementDetector {
  isEnhanced(): boolean;
  hydrate(): void;
  onEnhance(callback: () => void): void;
  features(): FeatureMap;
  gracefulProp<T>(enhanced: T, base: T): T;
  noScriptContent(html: string): { tag: 'noscript'; html: string };
}

export function createEnhancementDetector(): EnhancementDetector {
  let enhanced = false;
  const listeners: Array<() => void> = [];

  function isEnhanced(): boolean {
    return enhanced;
  }

  function hydrate(): void {
    if (enhanced) return;
    enhanced = true;
    for (const cb of listeners) {
      cb();
    }
  }

  function onEnhance(callback: () => void): void {
    listeners.push(callback);
  }

  function features(): FeatureMap {
    return {
      js: typeof globalThis !== 'undefined',
      intersection: typeof globalThis !== 'undefined' && typeof (globalThis as Record<string, unknown>).IntersectionObserver === 'function',
      resize: typeof globalThis !== 'undefined' && typeof (globalThis as Record<string, unknown>).ResizeObserver === 'function',
      mutationObserver: typeof globalThis !== 'undefined' && typeof (globalThis as Record<string, unknown>).MutationObserver === 'function',
    };
  }

  function gracefulProp<T>(enhancedVal: T, base: T): T {
    return enhanced ? enhancedVal : base;
  }

  function noScriptContent(html: string): { tag: 'noscript'; html: string } {
    return { tag: 'noscript', html };
  }

  return { isEnhanced, hydrate, onEnhance, features, gracefulProp, noScriptContent };
}
