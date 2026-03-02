import { describe, it, expect } from 'vitest';
import {
  PlannerErrorCode,
  PlannerError,
  errorMessage,
  isPlannerError,
  createPlannerError,
} from '../error-codes';

describe('Lane 02 — Planner Error Codes', () => {
  it('PlannerErrorCode enum has all expected members', () => {
    const codes = [
      PlannerErrorCode.INVALID_BATCH,
      PlannerErrorCode.CONSTRAINT_VIOLATION,
      PlannerErrorCode.TEMPLATE_NOT_FOUND,
      PlannerErrorCode.LAYOUT_OVERFLOW,
      PlannerErrorCode.ANCHOR_COLLISION,
      PlannerErrorCode.REPAIR_LIMIT_EXCEEDED,
      PlannerErrorCode.CONTEXT_MISSING,
      PlannerErrorCode.STYLE_INVALID,
      PlannerErrorCode.QUEUE_FULL,
      PlannerErrorCode.TIMEOUT,
    ];
    expect(codes).toHaveLength(10);
  });

  it('PlannerError extends Error', () => {
    const err = new PlannerError(PlannerErrorCode.INVALID_BATCH);
    expect(err).toBeInstanceOf(Error);
  });

  it('PlannerError exposes code property', () => {
    const err = new PlannerError(PlannerErrorCode.TIMEOUT);
    expect(err.code).toBe(PlannerErrorCode.TIMEOUT);
  });

  it('PlannerError exposes severity property', () => {
    const err = new PlannerError(PlannerErrorCode.TIMEOUT);
    expect(err.severity).toBe('fatal');
  });

  it('PlannerError exposes category property', () => {
    const err = new PlannerError(PlannerErrorCode.INVALID_BATCH);
    expect(err.category).toBe('validation');
  });

  it('errorMessage() returns human-readable string for each code', () => {
    const msg = errorMessage(PlannerErrorCode.CONTEXT_MISSING);
    expect(msg).toBe('Required whiteboard context was not provided');
  });

  it('isPlannerError() returns true for PlannerError instances', () => {
    const err = new PlannerError(PlannerErrorCode.QUEUE_FULL);
    expect(isPlannerError(err)).toBe(true);
  });

  it('isPlannerError() returns false for generic Error', () => {
    expect(isPlannerError(new Error('nope'))).toBe(false);
  });

  it('all error codes have distinct numeric values', () => {
    const values = Object.values(PlannerErrorCode).filter((v) => typeof v === 'number');
    expect(new Set(values).size).toBe(values.length);
  });

  it('createPlannerError helper produces correct instance', () => {
    const err = createPlannerError(PlannerErrorCode.LAYOUT_OVERFLOW, 'box too big');
    expect(err).toBeInstanceOf(PlannerError);
    expect(err.code).toBe(PlannerErrorCode.LAYOUT_OVERFLOW);
    expect(err.message).toContain('box too big');
  });
});
