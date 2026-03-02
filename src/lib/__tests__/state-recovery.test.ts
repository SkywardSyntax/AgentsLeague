import { describe, it, expect } from 'vitest';
import {
  createStateRecoveryGuard,
  validateChatSessionState,
  type ValidationResult,
} from '../state/state-recovery';

interface TestState {
  messages: { id: string; role: string; content: string }[];
  scene: { type: string; id: string }[];
  status?: string;
}

function makeValidState(overrides?: Partial<TestState>): TestState {
  return {
    messages: [{ id: '1', role: 'user', content: 'hello' }],
    scene: [{ type: 'rect', id: 'r1' }],
    status: 'idle',
    ...overrides,
  };
}

function simpleValidator(state: TestState): ValidationResult {
  return validateChatSessionState(state);
}

describe('State recovery guard', () => {
  it('checkpoint stores a state snapshot retrievable via lastGoodState', () => {
    const guard = createStateRecoveryGuard<TestState>({
      validate: simpleValidator,
    });

    const state = makeValidState();
    guard.checkpoint(state);
    expect(guard.lastGoodState()).toEqual(state);
  });

  it('tryRecover with valid state returns recovered: false with input state', () => {
    const guard = createStateRecoveryGuard<TestState>({
      validate: simpleValidator,
    });

    const state = makeValidState();
    const result = guard.tryRecover(state);
    expect(result.recovered).toBe(false);
    expect(result.state).toBe(state);
  });

  it('tryRecover with corrupted state returns recovered: true with lastGood', () => {
    const guard = createStateRecoveryGuard<TestState>({
      validate: simpleValidator,
    });

    const goodState = makeValidState();
    guard.checkpoint(goodState);

    const corruptState = { messages: 'not-array', scene: [], status: 'idle' } as unknown as TestState;
    const result = guard.tryRecover(corruptState);

    expect(result.recovered).toBe(true);
    expect(result.state).toEqual(goodState);
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
  });

  it('errors array lists specific validation failures', () => {
    const guard = createStateRecoveryGuard<TestState>({
      validate: simpleValidator,
    });

    guard.checkpoint(makeValidState());
    const corruptState = { messages: 'not-array', scene: [], status: 'idle' } as unknown as TestState;
    const result = guard.tryRecover(corruptState);

    expect(result.errors).toContain(
      'messages field is missing or not an array',
    );
  });

  it('multiple checkpoint calls keep the latest as lastGoodState', () => {
    const guard = createStateRecoveryGuard<TestState>({
      validate: simpleValidator,
    });

    const state1 = makeValidState({ status: 'idle' });
    const state2 = makeValidState({ status: 'thinking' });

    guard.checkpoint(state1);
    guard.checkpoint(state2);

    expect(guard.lastGoodState()).toEqual(state2);
  });

  it('snapshots respect maxSnapshots — oldest evicted when limit exceeded', () => {
    const guard = createStateRecoveryGuard<TestState>({
      validate: simpleValidator,
      maxSnapshots: 2,
    });

    const state1 = makeValidState({
      messages: [{ id: '1', role: 'user', content: 'first' }],
    });
    const state2 = makeValidState({
      messages: [{ id: '2', role: 'user', content: 'second' }],
    });
    const state3 = makeValidState({
      messages: [{ id: '3', role: 'user', content: 'third' }],
    });

    guard.checkpoint(state1);
    guard.checkpoint(state2);
    guard.checkpoint(state3);

    // state1 should be evicted, lastGoodState is state3
    expect(guard.lastGoodState()).toEqual(state3);
  });

  it('tryRecover with no prior checkpoint returns recovered: false with null state', () => {
    const guard = createStateRecoveryGuard<TestState>({
      validate: simpleValidator,
    });

    const corruptState = { messages: 'bad', scene: [] } as unknown as TestState;
    const result = guard.tryRecover(corruptState);

    expect(result.recovered).toBe(false);
    expect(result.state).toBeNull();
    expect(result.errors).toBeDefined();
  });

  it('state with missing messages field is detected as corrupt', () => {
    const result = validateChatSessionState({ scene: [], status: 'idle' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'messages field is missing or not an array',
    );
  });

  it('state with invalid DrawElement type in scene is detected as corrupt', () => {
    const result = validateChatSessionState({
      messages: [],
      scene: [{ type: 'unknown-element', id: 'x' }],
      status: 'idle',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Invalid DrawElement type'))).toBe(true);
  });

  it('checkpointed state is a deep copy — mutating original does not affect snapshot', () => {
    const guard = createStateRecoveryGuard<TestState>({
      validate: simpleValidator,
    });

    const state = makeValidState();
    guard.checkpoint(state);

    // Mutate original
    state.messages.push({ id: '2', role: 'assistant', content: 'mutated' });
    state.scene.push({ type: 'ellipse', id: 'e1' });

    const snapshot = guard.lastGoodState();
    expect(snapshot!.messages).toHaveLength(1);
    expect(snapshot!.scene).toHaveLength(1);
  });
});
