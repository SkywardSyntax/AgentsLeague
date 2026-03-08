import { describe, it, expect } from 'vitest';
import { BatchSequencer, globalSequencer } from '../batch-sequencer';

describe('BatchSequencer', () => {
  it('produces monotonically increasing sequence numbers', () => {
    const seq = new BatchSequencer();
    const values = Array.from({ length: 20 }, () => seq.next());

    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1]);
    }
  });

  it('createSequenced attaches correct sequence numbers', () => {
    const seq = new BatchSequencer();
    const a = seq.createSequenced({ type: 'add' });
    const b = seq.createSequenced({ type: 'remove' });

    expect(a.sequenceNumber).toBe(1);
    expect(b.sequenceNumber).toBe(2);
    // Original properties preserved
    expect(a.type).toBe('add');
    expect(b.type).toBe('remove');
  });

  it('globalSequencer is a shared singleton instance', () => {
    const n1 = globalSequencer.next();
    const n2 = globalSequencer.next();
    expect(n2).toBe(n1 + 1);
    expect(globalSequencer).toBeInstanceOf(BatchSequencer);
  });
});
