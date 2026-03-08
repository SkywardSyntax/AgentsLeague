/**
 * Monotonically increasing sequence numbers for cross-channel batch ordering.
 * Ensures SSE tool batches and inject batches can be applied deterministically
 * on the client regardless of arrival order. (STATE-001)
 */
export class BatchSequencer {
  private counter = 0;

  /** Returns the next monotonically increasing sequence number. */
  next(): number {
    return ++this.counter;
  }

  /** Attaches a sequenceNumber to the given batch object and returns it. */
  createSequenced<T>(batch: T): T & { sequenceNumber: number } {
    return { ...batch, sequenceNumber: this.next() };
  }
}

/** Global singleton used by the SSE stream route to stamp all outgoing batches. */
export const globalSequencer = new BatchSequencer();
