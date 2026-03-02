import { describe, it, expect } from 'vitest';
import {
  buildPoint,
  buildPoints,
  buildDrawElement,
  buildDrawBatch,
  buildSemanticBatch,
  buildChatMessage,
  buildStrokeTrajectory,
} from '@/test/factories';
import { DrawBatchBuilder, SemanticBatchBuilder } from '@/test/builders';
import { expectValidDrawBatch } from '@/test/assertions';

describe('Lane 07 — Test Helper API', () => {
  it('buildPoint returns { x, y } with defaults', () => {
    const point = buildPoint();
    expect(point).toMatchInlineSnapshot(`
      {
        "x": 0,
        "y": 0,
      }
    `);
  });

  it('buildPoints returns array of correct length', () => {
    const points = buildPoints(3);
    expect(points).toHaveLength(3);
    expect(Object.keys(points[0]).sort()).toMatchInlineSnapshot(`
      [
        "x",
        "y",
      ]
    `);
  });

  it('buildDrawElement returns a DrawElement with default rect type', () => {
    const el = buildDrawElement();
    expect(el.type).toBe('rect');
    expect('id' in el).toBe(true);
  });

  it('buildDrawBatch returns a DrawBatch with required fields', () => {
    const batch = buildDrawBatch();
    expect('batch_id' in batch).toBe(true);
    expect(Array.isArray(batch.elements)).toBe(true);
    expect(batch.elements.length).toBeGreaterThan(0);
  });

  it('buildSemanticBatch returns a SemanticBatch with required fields', () => {
    const batch = buildSemanticBatch();
    expect('batch_id' in batch).toBe(true);
    expect('template' in batch).toBe(true);
    expect(Array.isArray(batch.blocks)).toBe(true);
    expect(batch.blocks.length).toBeGreaterThan(0);
  });

  it('buildChatMessage returns a ChatMessage with required fields', () => {
    const msg = buildChatMessage();
    expect(Object.keys(msg).sort()).toMatchInlineSnapshot(`
      [
        "content",
        "createdAt",
        "id",
        "role",
      ]
    `);
  });

  it('buildStrokeTrajectory returns correct shape', () => {
    const stroke = buildStrokeTrajectory();
    expect(Object.keys(stroke).sort()).toMatchInlineSnapshot(`
      [
        "baseWidth",
        "color",
        "elementId",
        "id",
        "points",
      ]
    `);
  });

  it('DrawBatchBuilder API has withId, withElements, withStyle, build', () => {
    const builder = new DrawBatchBuilder();
    expect(typeof builder.withId).toBe('function');
    expect(typeof builder.withElements).toBe('function');
    expect(typeof builder.withStyle).toBe('function');
    expect(typeof builder.build).toBe('function');
  });

  it('SemanticBatchBuilder API has withEquationStack, withDiagramPanel, build', () => {
    const builder = new SemanticBatchBuilder();
    expect(typeof builder.withEquationStack).toBe('function');
    expect(typeof builder.withDiagramPanel).toBe('function');
    expect(typeof builder.build).toBe('function');
  });

  it('expectValidDrawBatch validates correct batch without throwing', () => {
    const batch = buildDrawBatch();
    expect(() => expectValidDrawBatch(batch)).not.toThrow();
  });
});
