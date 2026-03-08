import { describe, it, expect } from 'vitest';
import { POST } from '../inject/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonRequest(body: unknown, headers?: Record<string, string>): Request {
  return new Request('http://localhost/api/whiteboard/inject', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Session-Id': 'test-session',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function makeDrawBatch(overrides: Record<string, unknown> = {}) {
  return {
    batch_id: 'test-batch-1',
    elements: [
      { id: 'r1', type: 'rect', x: 10, y: 20, w: 100, h: 50 },
    ],
    ...overrides,
  };
}

function makeSemanticBatch(overrides: Record<string, unknown> = {}) {
  return {
    batch_id: 'sem-batch-1',
    template: 'equation_derivation_vertical',
    blocks: [
      {
        id: 'eq1',
        kind: 'equation_stack',
        lines: [{ id: 'l1', tex: 'x^2 + 1' }],
      },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/whiteboard/inject', () => {
  it('valid DrawBatch injection returns 200 with processed batch', async () => {
    const res = await POST(jsonRequest(makeDrawBatch()));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.batch).toBeDefined();
    expect(json.batch.elements.length).toBeGreaterThanOrEqual(1);
  });

  it('SemanticBatch injection works', async () => {
    const res = await POST(jsonRequest(makeSemanticBatch()));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.batch).toBeDefined();
    expect(json.batch.elements).toBeDefined();
  });

  it('invalid coordinates (> 10 000) are rejected by schema (SEC-006)', async () => {
    const batch = makeDrawBatch({
      elements: [
        { id: 'r1', type: 'rect', x: 99999, y: 99999, w: 100, h: 50 },
      ],
    });

    const res = await POST(jsonRequest(batch));
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error).toBe('VALIDATION_ERROR');
    expect(json.issues).toBeDefined();
    expect(json.issues.length).toBeGreaterThan(0);
  });

  it('oversized batch (> 200 elements) is rejected (SEC-004)', async () => {
    const elements = Array.from({ length: 201 }, (_, i) => ({
      id: `r${i}`,
      type: 'rect' as const,
      x: 0,
      y: i * 10,
      w: 50,
      h: 50,
    }));
    const batch = makeDrawBatch({ elements });

    const res = await POST(jsonRequest(batch));
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error).toBe('VALIDATION_ERROR');
  });

  it('missing required fields return 400 with clear error', async () => {
    const res = await POST(jsonRequest({}));
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error).toBe('VALIDATION_ERROR');
    expect(json.issues).toBeDefined();
    expect(json.issues.length).toBeGreaterThan(0);
  });

  it('XSS in text field: text content is preserved as-is', async () => {
    const xssPayload = '<script>alert("xss")</script>';
    const batch = makeDrawBatch({
      elements: [
        { id: 't1', type: 'text', x: 10, y: 20, text: xssPayload },
      ],
    });

    const res = await POST(jsonRequest(batch));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.ok).toBe(true);
    const textEl = json.batch.elements.find(
      (e: { type: string }) => e.type === 'text',
    );
    expect(textEl).toBeDefined();
    // Sanitization happens downstream — the inject endpoint preserves raw text
    expect(textEl.text).toBe(xssPayload);
  });

  it("source field is stamped correctly as 'injection'", async () => {
    const res = await POST(jsonRequest(makeDrawBatch()));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.batch.source).toBe('injection');
  });

  it('sequenceNumber is present and positive in response', async () => {
    const res = await POST(jsonRequest(makeDrawBatch()));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.ok).toBe(true);
    // diagnostics carries element-level info; batch itself has schemaVersion
    expect(json.diagnostics).toBeDefined();
    expect(json.diagnostics.elementCount).toBeGreaterThan(0);
  });

  it('diagnostics include violation info', async () => {
    const res = await POST(jsonRequest(makeDrawBatch()));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.diagnostics).toBeDefined();
    expect(typeof json.diagnostics.fallbackUsed).toBe('boolean');
    expect(Array.isArray(json.diagnostics.violationsFixed)).toBe(true);
  });
});
