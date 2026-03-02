import { describe, it, expect } from 'vitest';
import { createStreamAbortGuard } from '@/lib/agent/stream-abort-guard';

interface ParseState {
  chunks: string[];
  total: number;
}

const initial: ParseState = { chunks: [], total: 0 };
const parser = (state: ParseState, chunk: string): ParseState => ({
  chunks: [...state.chunks, chunk],
  total: state.total + chunk.length,
});
const clone = (s: ParseState): ParseState => ({
  chunks: [...s.chunks],
  total: s.total,
});

describe('stream abort guard', () => {
  it('normal stream processes all chunks', () => {
    const guard = createStreamAbortGuard(initial, parser, clone);
    guard.process('hello');
    guard.process(' world');
    const state = guard.getState();
    expect(state.chunks).toEqual(['hello', ' world']);
    expect(state.total).toBe(11);
  });

  it('abort mid-stream rolls back to last checkpoint', () => {
    const guard = createStreamAbortGuard(initial, parser, clone);
    guard.process('chunk1');
    guard.process('chunk2');
    // checkpoint is now at chunk1 state (before chunk2 was applied, checkpoint = state after chunk1)
    guard.abort();
    const state = guard.getState();
    // After abort, we roll back to the checkpoint taken before the last successful process
    // Actually, checkpoint is set at the START of each process, so last checkpoint = state before chunk2
    expect(state.chunks).toEqual(['chunk1']);
  });

  it('state after abort is clean (no partial data)', () => {
    const guard = createStreamAbortGuard(initial, parser, clone);
    guard.process('a');
    guard.abort();
    const state = guard.getState();
    // Rolled back to checkpoint before 'a' = initial
    expect(state.chunks).toEqual([]);
    expect(state.total).toBe(0);
  });

  it('post-abort, new stream works from clean state after reset', () => {
    const guard = createStreamAbortGuard(initial, parser, clone);
    guard.process('old');
    guard.abort();
    guard.reset();
    guard.process('new');
    expect(guard.getState().chunks).toEqual(['new']);
    expect(guard.isAborted()).toBe(false);
  });

  it('abort before any data is a no-op', () => {
    const guard = createStreamAbortGuard(initial, parser, clone);
    guard.abort();
    expect(guard.getState()).toEqual(initial);
    expect(guard.isAborted()).toBe(true);
  });

  it('multiple aborts are idempotent', () => {
    const guard = createStreamAbortGuard(initial, parser, clone);
    guard.process('data');
    guard.abort();
    guard.abort();
    guard.abort();
    expect(guard.isAborted()).toBe(true);
    expect(guard.getState().chunks).toEqual([]);
  });

  it('checkpoint is taken per chunk boundary', () => {
    const guard = createStreamAbortGuard(initial, parser, clone);
    guard.process('a');
    guard.process('b');
    guard.process('c');
    guard.abort();
    // Should roll back to checkpoint before 'c' = state after 'a', 'b'
    expect(guard.getState().chunks).toEqual(['a', 'b']);
  });

  it('error during parse triggers rollback', () => {
    const failParser = (state: ParseState, chunk: string): ParseState => {
      if (chunk === 'FAIL') throw new Error('parse error');
      return parser(state, chunk);
    };
    const guard = createStreamAbortGuard(initial, failParser, clone);
    guard.process('ok');
    guard.process('FAIL');
    expect(guard.isAborted()).toBe(true);
    expect(guard.getState().chunks).toEqual(['ok']);
  });

  it('guard exposes aborted flag', () => {
    const guard = createStreamAbortGuard(initial, parser, clone);
    expect(guard.isAborted()).toBe(false);
    guard.abort();
    expect(guard.isAborted()).toBe(true);
  });

  it('concurrent guards with separate state do not interfere', () => {
    const g1 = createStreamAbortGuard(initial, parser, clone);
    const g2 = createStreamAbortGuard(initial, parser, clone);
    g1.process('alpha');
    g2.process('beta');
    g1.abort();
    expect(g1.getState().chunks).toEqual([]);
    expect(g2.getState().chunks).toEqual(['beta']);
    expect(g2.isAborted()).toBe(false);
  });
});
