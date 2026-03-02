import { describe, expect, it } from 'vitest';
import {
  apiError,
  apiValidationError,
  type StandardErrorBody,
  type ZodLikeIssue,
} from '@/lib/server/api-error';

async function parseBody(response: Response): Promise<StandardErrorBody> {
  return response.json() as Promise<StandardErrorBody>;
}

describe('api-error standardised responses', () => {
  it('apiError returns Response with correct status code', () => {
    const res = apiError(400, 'BAD_REQUEST', 'test');
    expect(res.status).toBe(400);
  });

  it('apiError body has standard { error, message } shape', async () => {
    const res = apiError(400, 'BAD_REQUEST', 'missing field');
    const body = await parseBody(res);
    expect(body).toHaveProperty('error', 'BAD_REQUEST');
    expect(body).toHaveProperty('message', 'missing field');
    // Only expected keys
    const keys = Object.keys(body);
    expect(keys).toEqual(expect.arrayContaining(['error', 'message']));
    expect(keys.every((k) => ['error', 'message', 'requestId', 'issues'].includes(k))).toBe(true);
  });

  it('apiError sets Content-Type to application/json', () => {
    const res = apiError(422, 'RENDER_FAILED', 'bad tex');
    expect(res.headers.get('Content-Type')).toContain('application/json');
  });

  it('apiValidationError returns 400 status', () => {
    const issues: ZodLikeIssue[] = [
      { path: ['tex'], message: 'Required', code: 'invalid_type' },
    ];
    const res = apiValidationError(issues);
    expect(res.status).toBe(400);
  });

  it('apiValidationError transforms Zod issues to simplified format', async () => {
    const issues: ZodLikeIssue[] = [
      {
        path: ['tex'],
        message: 'Required',
        code: 'invalid_type',
        expected: 'string',
        received: 'undefined',
      },
    ];
    const res = apiValidationError(issues);
    const body = await parseBody(res);
    expect(body.issues).toEqual([{ field: 'tex', reason: 'Required' }]);
    // Ensure no Zod-internal fields leaked
    const issue = body.issues![0]!;
    expect(issue).not.toHaveProperty('code');
    expect(issue).not.toHaveProperty('expected');
    expect(issue).not.toHaveProperty('received');
  });

  it('apiError with requestId includes it in response body', async () => {
    const res = apiError(500, 'INTERNAL_ERROR', 'fail', 'req-123');
    const body = await parseBody(res);
    expect(body.requestId).toBe('req-123');
  });

  it('error codes must be SCREAMING_SNAKE_CASE', () => {
    expect(() => apiError(400, 'bad-request', 'test')).toThrow(
      /SCREAMING_SNAKE_CASE/,
    );
    // Valid codes should not throw
    expect(() => apiError(400, 'BAD_REQUEST', 'test')).not.toThrow();
    expect(() => apiError(404, 'NOT_FOUND', 'test')).not.toThrow();
  });

  it('apiError for 5xx sanitizes internal message', async () => {
    const res = apiError(
      500,
      'INTERNAL_ERROR',
      'database connection pool exhausted',
    );
    const body = await parseBody(res);
    expect(body.message).not.toContain('database');
    expect(typeof body.message).toBe('string');
    expect(body.message.length).toBeGreaterThan(0);
  });

  it('health route error scenario returns standard format', async () => {
    // Simulate what withErrorBoundary would produce for an unhandled throw
    const res = apiError(500, 'INTERNAL_ERROR', 'unexpected failure');
    const body = await parseBody(res);
    expect(body.error).toBe('INTERNAL_ERROR');
    expect(typeof body.message).toBe('string');
    expect(res.status).toBe(500);
  });

  it('standard error response message is a usable user-facing string', async () => {
    const res = apiError(503, 'SERVICE_UNAVAILABLE', 'server busy');
    const body = await parseBody(res);
    // The message should be a non-empty string suitable for display
    expect(typeof body.message).toBe('string');
    expect(body.message.length).toBeGreaterThan(0);
    // For non-5xx the original message is preserved
    const res4xx = apiError(400, 'BAD_REQUEST', 'Missing required field');
    const body4xx = await parseBody(res4xx);
    expect(body4xx.message).toBe('Missing required field');
  });
});
