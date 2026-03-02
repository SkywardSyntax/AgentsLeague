/**
 * Planner error codes — exhaustive error code enum with typed error classes
 * for the whiteboard planner subsystem.
 */

export enum PlannerErrorCode {
  INVALID_BATCH = 1001,
  CONSTRAINT_VIOLATION = 1002,
  TEMPLATE_NOT_FOUND = 1003,
  LAYOUT_OVERFLOW = 1004,
  ANCHOR_COLLISION = 1005,
  REPAIR_LIMIT_EXCEEDED = 1006,
  CONTEXT_MISSING = 1007,
  STYLE_INVALID = 1008,
  QUEUE_FULL = 1009,
  TIMEOUT = 1010,
}

export type PlannerErrorCategory = 'validation' | 'layout' | 'resource' | 'timeout';
export type PlannerErrorSeverity = 'warning' | 'error' | 'fatal';

const ERROR_META: Record<
  PlannerErrorCode,
  { message: string; category: PlannerErrorCategory; severity: PlannerErrorSeverity }
> = {
  [PlannerErrorCode.INVALID_BATCH]: {
    message: 'The draw batch is structurally invalid',
    category: 'validation',
    severity: 'error',
  },
  [PlannerErrorCode.CONSTRAINT_VIOLATION]: {
    message: 'One or more layout constraints were violated',
    category: 'layout',
    severity: 'warning',
  },
  [PlannerErrorCode.TEMPLATE_NOT_FOUND]: {
    message: 'No matching semantic template found',
    category: 'resource',
    severity: 'error',
  },
  [PlannerErrorCode.LAYOUT_OVERFLOW]: {
    message: 'Elements overflow the canvas bounds',
    category: 'layout',
    severity: 'warning',
  },
  [PlannerErrorCode.ANCHOR_COLLISION]: {
    message: 'Two or more anchors occupy the same point',
    category: 'layout',
    severity: 'warning',
  },
  [PlannerErrorCode.REPAIR_LIMIT_EXCEEDED]: {
    message: 'Maximum repair iterations exceeded without resolving violations',
    category: 'layout',
    severity: 'error',
  },
  [PlannerErrorCode.CONTEXT_MISSING]: {
    message: 'Required whiteboard context was not provided',
    category: 'validation',
    severity: 'fatal',
  },
  [PlannerErrorCode.STYLE_INVALID]: {
    message: 'The specified style preset is not recognized',
    category: 'validation',
    severity: 'error',
  },
  [PlannerErrorCode.QUEUE_FULL]: {
    message: 'The planning queue is at capacity',
    category: 'resource',
    severity: 'error',
  },
  [PlannerErrorCode.TIMEOUT]: {
    message: 'Planning operation timed out',
    category: 'timeout',
    severity: 'fatal',
  },
};

export class PlannerError extends Error {
  readonly code: PlannerErrorCode;
  readonly severity: PlannerErrorSeverity;
  readonly category: PlannerErrorCategory;

  constructor(code: PlannerErrorCode, details?: string) {
    const meta = ERROR_META[code];
    const fullMessage = details ? `${meta.message}: ${details}` : meta.message;
    super(fullMessage);
    this.name = 'PlannerError';
    this.code = code;
    this.severity = meta.severity;
    this.category = meta.category;
  }
}

export function errorMessage(code: PlannerErrorCode): string {
  return ERROR_META[code].message;
}

export function isPlannerError(err: unknown): err is PlannerError {
  return err instanceof PlannerError;
}

export function createPlannerError(code: PlannerErrorCode, details?: string): PlannerError {
  return new PlannerError(code, details);
}
