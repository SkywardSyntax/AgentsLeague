import { describe, it, expect } from 'vitest';
import { formatUserError } from '@/lib/errors/format-user-error';

const JARGON_PATTERNS = [/\bSSE\b/, /\bJSON\b/, /\bpayload\b/i, /\bHTTP\b/, /\bstatus code\b/i, /\bECONNREFUSED\b/];

describe('formatUserError', () => {
  it('maps HTTP 503 to "service busy" message', () => {
    const result = formatUserError('Stream request failed with status 503');
    expect(result).toContain('temporarily busy');
    expect(result).not.toContain('503');
  });

  it('maps HTTP 429 to "too many requests" message', () => {
    const result = formatUserError('Rate limited with status 429');
    expect(result.toLowerCase()).toContain('wait');
    expect(result).not.toContain('429');
  });

  it('maps HTTP 500 to generic server error', () => {
    const result = formatUserError('status 500');
    expect(result).toContain('went wrong on our end');
  });

  it('maps HTTP 401 to auth error', () => {
    const result = formatUserError('Unauthorized status 401');
    expect(result.toLowerCase()).toMatch(/authentication|api key/);
  });

  it('maps HTTP 400 to rephrasing suggestion', () => {
    const result = formatUserError('Bad request status 400');
    expect(result.toLowerCase()).toMatch(/rephrasing|couldn't be processed/);
  });

  it('maps SSE JSON payload to "interrupted" message', () => {
    const result = formatUserError('Invalid SSE JSON payload received');
    expect(result).toContain('interrupted');
    expect(result).not.toMatch(/SSE/);
    expect(result).not.toMatch(/JSON/);
  });

  it('maps trailing SSE error to same friendly message', () => {
    const result = formatUserError('Invalid trailing SSE JSON payload received');
    expect(result).toContain('interrupted');
  });

  it('maps stream aborted to "connection lost"', () => {
    const result = formatUserError('Stream aborted unexpectedly');
    expect(result.toLowerCase()).toContain('connection');
    expect(result).not.toMatch(/aborted/i);
  });

  it('returns generic fallback for unknown errors', () => {
    const result = formatUserError('some totally unknown error xyz');
    expect(result).toBe('Something went wrong. Please try again.');
  });

  it('no mapped message contains technical jargon', () => {
    const technicalInputs = [
      'status 503',
      'status 429',
      'status 401',
      'status 500',
      'status 400',
      'Invalid SSE JSON payload received',
      'Stream aborted unexpectedly',
      'network error',
      'timeout exceeded',
    ];

    for (const input of technicalInputs) {
      const result = formatUserError(input);
      for (const pat of JARGON_PATTERNS) {
        expect(result).not.toMatch(pat);
      }
    }
  });
});
