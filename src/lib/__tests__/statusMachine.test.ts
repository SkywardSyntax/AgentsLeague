import { describe, it, expect } from 'vitest';
import { transitionStatus } from '../state/statusMachine';

describe('transitionStatus', () => {
  it('allows idle → thinking', () => {
    expect(transitionStatus('idle', 'thinking')).toBe('thinking');
  });

  it('allows thinking → streaming', () => {
    expect(transitionStatus('thinking', 'streaming')).toBe('streaming');
  });

  it('allows thinking → drawing', () => {
    expect(transitionStatus('thinking', 'drawing')).toBe('drawing');
  });

  it('allows thinking → idle', () => {
    expect(transitionStatus('thinking', 'idle')).toBe('idle');
  });

  it('allows streaming → drawing', () => {
    expect(transitionStatus('streaming', 'drawing')).toBe('drawing');
  });

  it('allows streaming → idle', () => {
    expect(transitionStatus('streaming', 'idle')).toBe('idle');
  });

  it('allows drawing → drawing (no-op)', () => {
    expect(transitionStatus('drawing', 'drawing')).toBe('drawing');
  });

  it('allows drawing → idle', () => {
    expect(transitionStatus('drawing', 'idle')).toBe('idle');
  });

  it('rejects idle → streaming', () => {
    expect(transitionStatus('idle', 'streaming')).toBe('idle');
  });

  it('rejects idle → drawing', () => {
    expect(transitionStatus('idle', 'drawing')).toBe('idle');
  });

  it('rejects streaming → thinking', () => {
    expect(transitionStatus('streaming', 'thinking')).toBe('streaming');
  });

  it('returns current on same-state transition', () => {
    expect(transitionStatus('idle', 'idle')).toBe('idle');
    expect(transitionStatus('thinking', 'thinking')).toBe('thinking');
  });
});
