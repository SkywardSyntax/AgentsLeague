import { describe, expect, it } from 'vitest';
import {
  validateChatSessionState,
  createStateRecoveryGuard,
} from '@/lib/state/state-recovery';

describe('state-recovery edge cases', () => {
  describe('validateChatSessionState', () => {
    it('returns invalid for null state', () => {
      const result = validateChatSessionState(null);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('State is not an object');
    });

    it('returns invalid for non-object state (string)', () => {
      const result = validateChatSessionState('not-an-object');
      expect(result.valid).toBe(false);
    });

    it('returns invalid for non-object state (number)', () => {
      const result = validateChatSessionState(42);
      expect(result.valid).toBe(false);
    });

    it('reports missing messages field', () => {
      const result = validateChatSessionState({ status: 'idle' });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('messages'))).toBe(true);
    });

    it('reports invalid DrawElement types in scene', () => {
      const result = validateChatSessionState({
        messages: [],
        scene: [{ type: 'bogus' }],
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Invalid DrawElement type'))).toBe(true);
    });

    it('reports invalid status value', () => {
      const result = validateChatSessionState({
        messages: [],
        status: 'exploding',
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Invalid status'))).toBe(true);
    });

    it('returns valid for correct state', () => {
      const result = validateChatSessionState({
        messages: [{ role: 'user', content: 'hi' }],
        scene: [{ type: 'rect' }],
        status: 'idle',
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('createStateRecoveryGuard', () => {
    const alwaysValid = { validate: () => ({ valid: true, errors: [] as string[] }) };
    const alwaysInvalid = { validate: () => ({ valid: false, errors: ['corrupt'] }) };

    it('lastGoodState returns null when no checkpoints exist', () => {
      const guard = createStateRecoveryGuard<{ v: number }>(alwaysValid);
      expect(guard.lastGoodState()).toBeNull();
    });

    it('tryRecover returns recovered=false for valid state', () => {
      const guard = createStateRecoveryGuard<{ v: number }>(alwaysValid);
      const result = guard.tryRecover({ v: 1 });
      expect(result.recovered).toBe(false);
      expect(result.state).toEqual({ v: 1 });
    });

    it('tryRecover returns last checkpoint when state is invalid', () => {
      const guard = createStateRecoveryGuard<{ v: number }>(alwaysInvalid);
      guard.checkpoint({ v: 10 });
      const result = guard.tryRecover({ v: -1 });
      expect(result.recovered).toBe(true);
      expect(result.state).toEqual({ v: 10 });
    });

    it('tryRecover with no checkpoints returns recovered=false, state=null', () => {
      const guard = createStateRecoveryGuard<{ v: number }>(alwaysInvalid);
      const result = guard.tryRecover({ v: -1 });
      expect(result.recovered).toBe(false);
      expect(result.state).toBeNull();
    });

    it('evicts oldest snapshots beyond maxSnapshots', () => {
      const guard = createStateRecoveryGuard<{ v: number }>({
        ...alwaysInvalid,
        maxSnapshots: 2,
      });
      guard.checkpoint({ v: 1 });
      guard.checkpoint({ v: 2 });
      guard.checkpoint({ v: 3 });
      const result = guard.tryRecover({ v: -1 });
      expect(result.state).toEqual({ v: 3 });
    });

    it('deep copies state so mutations do not affect checkpoint', () => {
      const guard = createStateRecoveryGuard<{ items: number[] }>(alwaysInvalid);
      const original = { items: [1, 2, 3] };
      guard.checkpoint(original);
      original.items.push(4);
      const result = guard.tryRecover({ items: [] });
      expect(result.state!.items).toEqual([1, 2, 3]);
    });
  });
});
