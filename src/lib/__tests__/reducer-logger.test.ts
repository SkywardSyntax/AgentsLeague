import { describe, it, expect, beforeEach } from 'vitest';
import { createReducerLogger, type ReducerLogger } from '../state/reducer-logger';

interface TestState {
  count: number;
  label: string;
}

type TestAction =
  | { type: 'INCREMENT' }
  | { type: 'SET_LABEL'; label: string }
  | { type: 'NOOP' };

function testReducer(state: TestState, action: TestAction): TestState {
  switch (action.type) {
    case 'INCREMENT':
      return { ...state, count: state.count + 1 };
    case 'SET_LABEL':
      return { ...state, label: action.label };
    case 'NOOP':
      return state;
    default:
      return state;
  }
}

describe('createReducerLogger', () => {
  let logger: ReducerLogger;
  const initialState: TestState = { count: 0, label: 'init' };

  beforeEach(() => {
    logger = createReducerLogger();
  });

  it('wrapped reducer passes through action correctly when enabled', () => {
    logger.enabled = true;
    const wrapped = logger.wrap(testReducer);
    const result = wrapped(initialState, { type: 'INCREMENT' });

    expect(result).toEqual({ count: 1, label: 'init' });
  });

  it('wrapped reducer passes through action correctly when disabled', () => {
    logger.enabled = false;
    const wrapped = logger.wrap(testReducer);
    const result = wrapped(initialState, { type: 'INCREMENT' });

    expect(result).toEqual({ count: 1, label: 'init' });
    expect(logger.entries).toHaveLength(0);
  });

  it('log entry records correct action type', () => {
    logger.enabled = true;
    const wrapped = logger.wrap(testReducer);
    wrapped(initialState, { type: 'INCREMENT' });

    expect(logger.entries).toHaveLength(1);
    expect(logger.entries[0]!.action.type).toBe('INCREMENT');
  });

  it('log entry captures before state via snapshotFn', () => {
    logger.enabled = true;
    const wrapped = logger.wrap(testReducer);
    wrapped(initialState, { type: 'INCREMENT' });

    const entry = logger.entries[0]!;
    expect(entry.stateBefore).toHaveProperty('count', 0);
    expect(entry.stateBefore).toHaveProperty('label', 'init');
  });

  it('log entry captures after state via snapshotFn', () => {
    logger.enabled = true;
    const wrapped = logger.wrap(testReducer);
    wrapped(initialState, { type: 'SET_LABEL', label: 'updated' });

    const entry = logger.entries[0]!;
    expect(entry.stateAfter).toHaveProperty('label', 'updated');
  });

  it('stateChanged is true when reducer produces new reference', () => {
    logger.enabled = true;
    const wrapped = logger.wrap(testReducer);
    wrapped(initialState, { type: 'INCREMENT' });

    expect(logger.entries[0]!.stateChanged).toBe(true);
  });

  it('stateChanged is false when reducer returns same reference', () => {
    logger.enabled = true;
    const wrapped = logger.wrap(testReducer);
    wrapped(initialState, { type: 'NOOP' });

    expect(logger.entries[0]!.stateChanged).toBe(false);
  });

  it('durationMs is a non-negative number', () => {
    logger.enabled = true;
    const wrapped = logger.wrap(testReducer);
    wrapped(initialState, { type: 'INCREMENT' });

    expect(logger.entries[0]!.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('entries are capped at maxEntries (oldest evicted)', () => {
    const capped = createReducerLogger({ maxEntries: 200 });
    capped.enabled = true;
    const wrapped = capped.wrap(testReducer);

    let state = initialState;
    for (let i = 0; i < 250; i++) {
      state = wrapped(state, { type: 'INCREMENT' });
    }

    expect(capped.entries).toHaveLength(200);
    // Oldest entries should have been evicted — first remaining entry should not be the very first
    expect(capped.entries[0]!.stateAfter.count).toBe(51);
  });

  it('clear() removes all entries', () => {
    logger.enabled = true;
    const wrapped = logger.wrap(testReducer);
    wrapped(initialState, { type: 'INCREMENT' });
    wrapped({ count: 1, label: 'init' }, { type: 'INCREMENT' });

    expect(logger.entries.length).toBeGreaterThan(0);
    logger.clear();
    expect(logger.snapshot()).toHaveLength(0);
  });
});
