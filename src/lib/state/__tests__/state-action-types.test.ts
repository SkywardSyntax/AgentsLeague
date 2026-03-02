import { describe, it, expect } from 'vitest';
import {
  createOrderedDispatcher,
} from '@/lib/state/ordered-dispatch';
import type { OrderedDispatcher } from '@/lib/state/ordered-dispatch';
import {
  validateChatSessionState,
  createStateRecoveryGuard,
} from '@/lib/state/state-recovery';
import type {
  ValidationResult,
  RecoveryResult,
  StateRecoveryGuard,
} from '@/lib/state/state-recovery';
import { createReducerLogger } from '@/lib/state/reducer-logger';
import type { ReducerLogEntry, ReducerLogger } from '@/lib/state/reducer-logger';

describe('Lane 06 — State Action Types', () => {
  it('OrderedDispatcher interface has dispatch, getState, subscribe, isIdle', () => {
    const dispatcher = createOrderedDispatcher<number, { type: string }>(
      (state, _action) => state + 1,
      0,
    );
    expect(Object.keys(dispatcher).sort()).toMatchInlineSnapshot(`
      [
        "dispatch",
        "getState",
        "isIdle",
        "subscribe",
      ]
    `);
  });

  it('createOrderedDispatcher is an exported function', () => {
    expect(typeof createOrderedDispatcher).toBe('function');
  });

  it('dispatch returns a Promise', () => {
    const dispatcher = createOrderedDispatcher<number, { type: string }>(
      (state) => state + 1,
      0,
    );
    const result = dispatcher.dispatch({ type: 'INC' });
    expect(result).toBeInstanceOf(Promise);
  });

  it('subscribe returns an unsubscribe function', () => {
    const dispatcher = createOrderedDispatcher<number, { type: string }>(
      (state) => state + 1,
      0,
    );
    const unsub = dispatcher.subscribe(() => {});
    expect(typeof unsub).toBe('function');
  });

  it('ValidationResult interface shape is stable', () => {
    const result: ValidationResult = { valid: true, errors: [] };
    expect(Object.keys(result).sort()).toMatchInlineSnapshot(`
      [
        "errors",
        "valid",
      ]
    `);
  });

  it('RecoveryResult interface shape is stable', () => {
    const result: RecoveryResult<unknown> = {
      recovered: false,
      state: null,
      errors: [],
    };
    expect(Object.keys(result).sort()).toMatchInlineSnapshot(`
      [
        "errors",
        "recovered",
        "state",
      ]
    `);
  });

  it('StateRecoveryGuard has checkpoint, tryRecover, lastGoodState', () => {
    const guard = createStateRecoveryGuard({
      validate: () => ({ valid: true, errors: [] }),
    });
    expect(Object.keys(guard).sort()).toMatchInlineSnapshot(`
      [
        "checkpoint",
        "lastGoodState",
        "tryRecover",
      ]
    `);
  });

  it('validateChatSessionState validates correct state', () => {
    const result = validateChatSessionState({
      messages: [],
      scene: [],
      status: 'idle',
    });
    expect(result).toMatchInlineSnapshot(`
      {
        "errors": [],
        "valid": true,
      }
    `);
  });

  it('ReducerLogEntry interface shape is stable', () => {
    const entry: ReducerLogEntry = {
      ts: Date.now(),
      action: { type: 'TEST' },
      stateBefore: {},
      stateAfter: {},
      durationMs: 1,
      stateChanged: true,
    };
    expect(Object.keys(entry).sort()).toMatchInlineSnapshot(`
      [
        "action",
        "durationMs",
        "stateAfter",
        "stateBefore",
        "stateChanged",
        "ts",
      ]
    `);
  });

  it('ReducerLogger has enabled, entries, wrap, snapshot, clear', () => {
    const logger = createReducerLogger();
    expect(Object.keys(logger).sort()).toMatchInlineSnapshot(`
      [
        "clear",
        "enabled",
        "entries",
        "snapshot",
        "wrap",
      ]
    `);
  });
});
