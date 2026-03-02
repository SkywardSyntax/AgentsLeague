import { describe, it, expect } from 'vitest';
import { appendToStreamBuffer, MAX_STREAM_BUFFER } from '@/lib/server/stream-buffer';

describe('appendToStreamBuffer', () => {
  it('appends normally when combined size is within limit', () => {
    const result = appendToStreamBuffer('hello', ' world');
    expect(result.buffer).toBe('hello world');
    expect(result.truncated).toBe(false);
  });

  it('truncates from front when exceeding MAX_STREAM_BUFFER', () => {
    const base = 'A'.repeat(MAX_STREAM_BUFFER - 10);
    const incoming = 'B'.repeat(20); // total exceeds limit by 10
    const result = appendToStreamBuffer(base, incoming);
    expect(result.truncated).toBe(true);
    expect(result.buffer.length).toBe(Math.floor(MAX_STREAM_BUFFER / 2));
    // recent content (the Bs) must be preserved at the end
    expect(result.buffer.endsWith(incoming)).toBe(true);
  });

  it('does not truncate at exactly MAX_STREAM_BUFFER', () => {
    const base = 'X'.repeat(MAX_STREAM_BUFFER - 5);
    const incoming = 'Y'.repeat(5);
    const result = appendToStreamBuffer(base, incoming);
    expect(result.buffer.length).toBe(MAX_STREAM_BUFFER);
    expect(result.truncated).toBe(false);
  });

  it('preserves most recent content after truncation', () => {
    const base = 'OLD'.repeat(MAX_STREAM_BUFFER);
    const incoming = 'NEW_CONTENT';
    const result = appendToStreamBuffer(base, incoming);
    expect(result.truncated).toBe(true);
    expect(result.buffer.endsWith('NEW_CONTENT')).toBe(true);
  });

  it('handles empty current buffer', () => {
    const result = appendToStreamBuffer('', 'data');
    expect(result.buffer).toBe('data');
    expect(result.truncated).toBe(false);
  });

  it('handles empty incoming data', () => {
    const result = appendToStreamBuffer('existing', '');
    expect(result.buffer).toBe('existing');
    expect(result.truncated).toBe(false);
  });
});
