import { test, expect } from '@playwright/test';

test.describe('POST /api/whiteboard/inject', () => {
  const ENDPOINT = '/api/whiteboard/inject';

  const jsonHeaders = (sessionId: string) => ({
    'Content-Type': 'application/json',
    'X-Session-Id': sessionId,
  });

  // -----------------------------------------------------------------------
  // 1. Simple rect batch → 200 ok: true
  // -----------------------------------------------------------------------
  test('accepts a simple rect batch and returns ok: true', async ({ request }) => {
    const response = await request.post(ENDPOINT, {
      headers: jsonHeaders('e2e-rect'),
      data: {
        batch_id: 'test-rect-1',
        elements: [
          { id: 'r1', type: 'rect', x: 100, y: 100, w: 200, h: 100 },
        ],
      },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.batch).toBeDefined();
    expect(body.batch.elements.length).toBeGreaterThanOrEqual(1);
    expect(body.diagnostics).toBeDefined();
    expect(body.diagnostics.elementCount).toBeGreaterThanOrEqual(1);
  });

  // -----------------------------------------------------------------------
  // 2. Invalid payload → 400
  // -----------------------------------------------------------------------
  test('rejects an invalid payload with 400 VALIDATION_ERROR', async ({ request }) => {
    const response = await request.post(ENDPOINT, {
      headers: jsonHeaders('e2e-invalid'),
      data: { not: 'a valid batch' },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('VALIDATION_ERROR');
    expect(Array.isArray(body.issues)).toBe(true);
    expect(body.issues.length).toBeGreaterThan(0);
  });

  // -----------------------------------------------------------------------
  // 3. cartesian_axes → 200 with expanded elements
  // -----------------------------------------------------------------------
  test('accepts cartesian_axes element and returns expanded elements', async ({ request }) => {
    const response = await request.post(ENDPOINT, {
      headers: jsonHeaders('e2e-axes'),
      data: {
        batch_id: 'test-axes-1',
        elements: [
          {
            id: 'axes1',
            type: 'cartesian_axes',
            x: 50,
            y: 50,
            width: 400,
            height: 300,
            xRange: [-5, 5],
            yRange: [-3, 3],
            xLabel: 'x',
            yLabel: 'y',
          },
        ],
      },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    // cartesian_axes is a compound element — the lowerer expands it into
    // multiple primitive strokes (lines, text labels, etc.)
    expect(body.diagnostics.elementCount).toBeGreaterThanOrEqual(1);
  });

  // -----------------------------------------------------------------------
  // 4. normal_distribution (math element) → 200
  //    (function_curve is not in the strict DrawElementSchema discriminated
  //     union, so we test normal_distribution as the math-heavy element)
  // -----------------------------------------------------------------------
  test('accepts normal_distribution math element', async ({ request }) => {
    const response = await request.post(ENDPOINT, {
      headers: jsonHeaders('e2e-normal'),
      data: {
        batch_id: 'test-normal-1',
        elements: [
          {
            id: 'nd1',
            type: 'normal_distribution',
            x: 50,
            y: 50,
            width: 400,
            height: 200,
            mu: 0,
            sigma: 1,
          },
        ],
      },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.diagnostics.elementCount).toBeGreaterThanOrEqual(1);
  });

  // -----------------------------------------------------------------------
  // 5. Missing all required fields → 400 schema validation error
  // -----------------------------------------------------------------------
  test('returns 400 when required fields are missing', async ({ request }) => {
    const response = await request.post(ENDPOINT, {
      headers: jsonHeaders('e2e-missing'),
      data: {
        // batch_id is required (min 1 char), elements is required
      },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('VALIDATION_ERROR');
    expect(body.issues).toBeDefined();
    expect(body.issues.length).toBeGreaterThan(0);
  });

  // -----------------------------------------------------------------------
  // 6. Missing X-Session-Id header → 401
  // -----------------------------------------------------------------------
  test('returns 401 when X-Session-Id header is missing', async ({ request }) => {
    const response = await request.post(ENDPOINT, {
      headers: { 'Content-Type': 'application/json' },
      data: {
        batch_id: 'test-no-session',
        elements: [{ id: 'r1', type: 'rect', x: 10, y: 10, w: 50, h: 50 }],
      },
    });

    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error).toBe('SESSION_REQUIRED');
  });

  // -----------------------------------------------------------------------
  // 7. Multi-element batch with mixed types → 200
  // -----------------------------------------------------------------------
  test('accepts a multi-element batch with mixed types', async ({ request }) => {
    const response = await request.post(ENDPOINT, {
      headers: jsonHeaders('e2e-multi'),
      data: {
        batch_id: 'test-multi-1',
        elements: [
          { id: 'r1', type: 'rect', x: 10, y: 10, w: 100, h: 60 },
          { id: 'e1', type: 'ellipse', cx: 200, cy: 100, rx: 50, ry: 30 },
          { id: 'l1', type: 'line', from: { x: 10, y: 200 }, to: { x: 300, y: 200 } },
          { id: 'a1', type: 'arrow', from: { x: 100, y: 50 }, to: { x: 250, y: 80 } },
          { id: 't1', type: 'text', x: 50, y: 250, text: 'Hello', size: 16 },
        ],
      },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.diagnostics.elementCount).toBe(5);
  });

  // -----------------------------------------------------------------------
  // 8. Rate limiting → 429 after exceeding 30 requests per 60 s window
  // -----------------------------------------------------------------------
  test('returns 429 after exceeding rate limit', async ({ request }) => {
    const sessionId = `e2e-ratelimit-${Date.now()}`;
    const makeReq = (i: number) =>
      request.post(ENDPOINT, {
        headers: jsonHeaders(sessionId),
        data: {
          batch_id: `rl-${i}`,
          elements: [{ id: `r${i}`, type: 'rect', x: 0, y: 0, w: 10, h: 10 }],
        },
      });

    // Send 35 requests (limit is 30/60 s) — fire in parallel to be fast
    const responses = await Promise.all(
      Array.from({ length: 35 }, (_, i) => makeReq(i)),
    );

    const statuses = responses.map((r) => r.status());
    expect(statuses.filter((s) => s === 200).length).toBeGreaterThan(0);
    expect(statuses).toContain(429);
  });
});
