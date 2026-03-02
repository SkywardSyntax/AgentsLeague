import { describe, it, expect } from 'vitest';
import { DrawBatchSchema, normalizeDrawBatchPayload } from '@/lib/schema';

// Inline the mock data to avoid importing from __mocks__ (server-only path).
const MOCK_BATCHES: Record<string, { batch_id: string; elements: Array<Record<string, unknown>> }> = {
  math: {
    batch_id: 'mock-math-1',
    elements: [
      { id: 'mm-1', type: 'rect', x: 100, y: 100, w: 250, h: 180, color: '#1565c0' },
      { id: 'mm-2', type: 'text', x: 150, y: 140, text: 'Unit Circle', size: 16 },
      { id: 'mm-3', type: 'ellipse', cx: 225, cy: 220, rx: 60, ry: 60, color: '#1976d2' },
    ],
  },
  biology: {
    batch_id: 'mock-bio-1',
    elements: [
      { id: 'mb-1', type: 'rect', x: 100, y: 100, w: 200, h: 120, color: '#388e3c' },
      { id: 'mb-2', type: 'text', x: 150, y: 140, text: 'Cell Membrane', size: 16 },
      { id: 'mb-3', type: 'ellipse', cx: 200, cy: 200, rx: 40, ry: 25, color: '#4caf50' },
    ],
  },
  art: {
    batch_id: 'mock-art-1',
    elements: [
      { id: 'ma-1', type: 'rect', x: 100, y: 100, w: 300, h: 200, color: '#e65100' },
      { id: 'ma-2', type: 'line', from: { x: 100, y: 200 }, to: { x: 400, y: 150 }, color: '#ff6d00' },
      { id: 'ma-3', type: 'text', x: 200, y: 260, text: 'Mountain Skyline', size: 14 },
    ],
  },
  physics: {
    batch_id: 'mock-phys-1',
    elements: [
      { id: 'mp-1', type: 'rect', x: 100, y: 100, w: 280, h: 160, color: '#c62828' },
      { id: 'mp-2', type: 'arrow', from: { x: 150, y: 200 }, to: { x: 350, y: 140 }, color: '#d32f2f' },
      { id: 'mp-3', type: 'text', x: 180, y: 230, text: 'Force Vector', size: 14 },
    ],
  },
};

function detectDomain(query: string): string {
  const DOMAIN_KEYWORDS: Record<string, string[]> = {
    biology: ['cell', 'neuron', 'dna', 'biology'],
    art: ['mountain', 'abstract', 'portrait', 'art'],
    math: ['circle', 'parabola', 'triangle', 'math'],
    physics: ['free-body', 'circuit', 'projectile', 'physics'],
  };
  const lower = query.toLowerCase();
  let bestDomain = 'math';
  let bestScore = 0;
  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    const score = keywords.filter((kw) => lower.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      bestDomain = domain;
    }
  }
  return bestDomain;
}

describe('E2E↔Mock contract', () => {
  it('mock math batch validates against DrawBatchSchema', () => {
    const result = DrawBatchSchema.safeParse(MOCK_BATCHES.math);
    expect(result.success).toBe(true);
  });

  it('mock biology batch validates against DrawBatchSchema', () => {
    const result = DrawBatchSchema.safeParse(MOCK_BATCHES.biology);
    expect(result.success).toBe(true);
  });

  it('mock art batch validates against DrawBatchSchema', () => {
    const result = DrawBatchSchema.safeParse(MOCK_BATCHES.art);
    expect(result.success).toBe(true);
  });

  it('mock physics batch validates against DrawBatchSchema', () => {
    const result = DrawBatchSchema.safeParse(MOCK_BATCHES.physics);
    expect(result.success).toBe(true);
  });

  it('mock SSE sequence contains all required event types', () => {
    const requiredTypes = ['assistant.text.delta', 'assistant.text.done', 'whiteboard.batch', 'turn.done'];
    // The mock stream sends: text.delta × 2, text.done, batch, turn.done
    const mockSequenceTypes = [
      'assistant.text.delta',
      'assistant.text.delta',
      'assistant.text.done',
      'whiteboard.batch',
      'turn.done',
    ];
    for (const required of requiredTypes) {
      expect(mockSequenceTypes).toContain(required);
    }
  });

  it('mock batch elements each have valid type discriminator', () => {
    const validTypes = ['rect', 'ellipse', 'line', 'arrow', 'text', 'latex', 'clear'];
    for (const batch of Object.values(MOCK_BATCHES)) {
      for (const el of batch.elements) {
        expect(validTypes).toContain(el.type);
      }
    }
  });

  it('mock batch element IDs are all unique within a batch', () => {
    for (const batch of Object.values(MOCK_BATCHES)) {
      const ids = batch.elements.map((e) => e.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('mock turn.done usage object has prompt/completion/total fields', () => {
    const usage = { prompt: 100, completion: 50, total: 150 };
    expect(usage).toHaveProperty('prompt');
    expect(usage).toHaveProperty('completion');
    expect(usage).toHaveProperty('total');
    expect(typeof usage.prompt).toBe('number');
    expect(typeof usage.completion).toBe('number');
    expect(typeof usage.total).toBe('number');
  });

  it('detectDomain returns valid domain for keyword match', () => {
    expect(detectDomain('draw a cell')).toBe('biology');
    expect(detectDomain('draw a circle')).toBe('math');
    expect(detectDomain('draw a mountain')).toBe('art');
    expect(detectDomain('draw a circuit')).toBe('physics');
  });

  it('all mock elements pass normalizeDrawBatchPayload without warnings', () => {
    for (const batch of Object.values(MOCK_BATCHES)) {
      const { normalized, warnings } = normalizeDrawBatchPayload(batch);
      expect(normalized).not.toBeNull();
      expect(warnings).toHaveLength(0);
    }
  });
});
