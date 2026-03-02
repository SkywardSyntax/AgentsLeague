import { describe, it, expect } from 'vitest';
import { createAnimationReconciler } from '@/lib/whiteboard/animation-reconciler';

describe('animation reconciler', () => {
  it('JS claim registers property', () => {
    const rec = createAnimationReconciler();
    rec.claimJS('transform');
    const active = rec.activeAnimations();
    expect(active).toHaveLength(1);
    expect(active[0]?.property).toBe('transform');
    expect(active[0]?.source).toBe('js');
  });

  it('CSS transition deferred while JS active', () => {
    const rec = createAnimationReconciler();
    rec.claimJS('opacity');
    expect(rec.canApplyCSS('opacity')).toBe(false);
  });

  it('JS release allows CSS transition', () => {
    const rec = createAnimationReconciler();
    rec.claimJS('opacity');
    rec.releaseJS('opacity');
    expect(rec.canApplyCSS('opacity')).toBe(true);
  });

  it('multiple properties tracked independently', () => {
    const rec = createAnimationReconciler();
    rec.claimJS('opacity');
    rec.claimJS('transform');
    expect(rec.canApplyCSS('opacity')).toBe(false);
    expect(rec.canApplyCSS('transform')).toBe(false);
    expect(rec.canApplyCSS('color')).toBe(true);
    rec.releaseJS('opacity');
    expect(rec.canApplyCSS('opacity')).toBe(true);
    expect(rec.canApplyCSS('transform')).toBe(false);
  });

  it('double JS claim is idempotent', () => {
    const rec = createAnimationReconciler();
    rec.claimJS('opacity');
    rec.claimJS('opacity');
    expect(rec.activeAnimations()).toHaveLength(1);
    rec.releaseJS('opacity');
    expect(rec.canApplyCSS('opacity')).toBe(true);
  });

  it('release of unclaimed property is safe', () => {
    const rec = createAnimationReconciler();
    expect(() => rec.releaseJS('nonexistent')).not.toThrow();
    expect(rec.activeAnimations()).toHaveLength(0);
  });

  it('activeAnimations returns current claims', () => {
    const rec = createAnimationReconciler();
    rec.claimJS('a');
    rec.claimJS('b');
    rec.claimJS('c');
    const props = rec.activeAnimations().map((c) => c.property).sort();
    expect(props).toEqual(['a', 'b', 'c']);
  });

  it('JS claim + release cycle works repeatedly', () => {
    const rec = createAnimationReconciler();
    for (let i = 0; i < 5; i++) {
      rec.claimJS('prop');
      expect(rec.canApplyCSS('prop')).toBe(false);
      rec.releaseJS('prop');
      expect(rec.canApplyCSS('prop')).toBe(true);
    }
  });

  it('priority resolves JS over CSS', () => {
    const rec = createAnimationReconciler();
    // CSS is allowed when no JS claim
    expect(rec.canApplyCSS('x')).toBe(true);
    // JS takes priority
    rec.claimJS('x');
    expect(rec.canApplyCSS('x')).toBe(false);
    // Release restores CSS
    rec.releaseJS('x');
    expect(rec.canApplyCSS('x')).toBe(true);
  });

  it('clear removes all claims', () => {
    const rec = createAnimationReconciler();
    rec.claimJS('a');
    rec.claimJS('b');
    rec.claimJS('c');
    rec.clear();
    expect(rec.activeAnimations()).toHaveLength(0);
    expect(rec.canApplyCSS('a')).toBe(true);
    expect(rec.canApplyCSS('b')).toBe(true);
  });
});
