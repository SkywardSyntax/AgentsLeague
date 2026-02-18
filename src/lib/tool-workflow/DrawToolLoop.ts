/**
 * DrawToolLoop — orchestrates the tool-use loop between the LLM and
 * the whiteboard canvas.
 *
 * State machine:
 *   IDLE → PROCESSING → DRAWING → IDLE
 *   (with loopback: DRAWING + done:false → PROCESSING)
 *
 * Max 15 iterations per turn; forces done:true if exceeded.
 */

import type { DrawElement, DrawOp, BoundingBox } from '@/types';
import { buildToolResult, type ToolResult } from './ToolResultBuilder';
import { ContextManager, type ConversationTurn } from './ContextManager';

// ── Constants ───────────────────────────────────────────────────────

export const MAX_ITERATIONS = 15;

const CANVAS_BOUNDS: BoundingBox = { x: -10_000, y: -10_000, w: 20_000, h: 20_000 };

// ── State machine ───────────────────────────────────────────────────

export type LoopStatus = 'IDLE' | 'PROCESSING' | 'DRAWING';

export class StateManager {
  private _status: LoopStatus = 'IDLE';

  get status(): LoopStatus {
    return this._status;
  }

  /** Transition with enforcement — throws on illegal transitions. */
  transition(to: LoopStatus): void {
    if (!StateManager.isLegal(this._status, to)) {
      throw new Error(`Illegal transition: ${this._status} → ${to}`);
    }
    this._status = to;
  }

  reset(): void {
    this._status = 'IDLE';
  }

  static isLegal(from: LoopStatus, to: LoopStatus): boolean {
    switch (from) {
      case 'IDLE':
        return to === 'PROCESSING';
      case 'PROCESSING':
        return to === 'DRAWING' || to === 'IDLE';
      case 'DRAWING':
        return to === 'PROCESSING' || to === 'IDLE';
      default:
        return false;
    }
  }
}

// ── Validation ──────────────────────────────────────────────────────

export interface ValidationError {
  readonly op: DrawOp;
  readonly reason: string;
}

function isInBounds(el: DrawElement): boolean {
  return (
    el.x >= CANVAS_BOUNDS.x &&
    el.y >= CANVAS_BOUNDS.y &&
    el.x <= CANVAS_BOUNDS.x + CANVAS_BOUNDS.w &&
    el.y <= CANVAS_BOUNDS.y + CANVAS_BOUNDS.h
  );
}

export function validateOps(
  ops: readonly DrawOp[],
  existingIds: ReadonlySet<string>,
): { valid: DrawOp[]; errors: ValidationError[] } {
  const valid: DrawOp[] = [];
  const errors: ValidationError[] = [];
  const seenAddIds = new Set<string>();

  for (const op of ops) {
    switch (op.op) {
      case 'add': {
        if (seenAddIds.has(op.element.id) || existingIds.has(op.element.id)) {
          errors.push({ op, reason: `Duplicate id: ${op.element.id}` });
          continue;
        }
        if (!isInBounds(op.element)) {
          errors.push({ op, reason: `Out of bounds: (${op.element.x}, ${op.element.y})` });
          continue;
        }
        seenAddIds.add(op.element.id);
        valid.push(op);
        break;
      }
      case 'update': {
        if (!existingIds.has(op.id) && !seenAddIds.has(op.id)) {
          errors.push({ op, reason: `Unknown element: ${op.id}` });
          continue;
        }
        valid.push(op);
        break;
      }
      case 'delete': {
        if (!existingIds.has(op.id)) {
          errors.push({ op, reason: `Unknown element: ${op.id}` });
          continue;
        }
        valid.push(op);
        break;
      }
      case 'clear':
        valid.push(op);
        break;
    }
  }

  return { valid, errors };
}

// ── Canvas store interface ──────────────────────────────────────────

export interface WhiteboardStore {
  getElements(): Map<string, DrawElement>;
  applyOps(ops: DrawOp[]): void;
}

// ── Draw tool loop ──────────────────────────────────────────────────

export class DrawToolLoop {
  readonly state = new StateManager();
  readonly context: ContextManager;
  private iteration = 0;
  private allCommittedElements: DrawElement[] = [];

  constructor(context?: ContextManager) {
    this.context = context ?? new ContextManager();
  }

  // ── Getters ─────────────────────────────────────────────────────

  getIteration(): number {
    return this.iteration;
  }

  isMaxIterations(): boolean {
    return this.iteration >= MAX_ITERATIONS;
  }

  // ── Core loop operations ────────────────────────────────────────

  /** Begin processing a user message. */
  begin(): void {
    this.state.transition('PROCESSING');
    this.iteration = 0;
    this.allCommittedElements = [];
  }

  /**
   * Execute validated draw ops against the canvas store.
   * Returns the tool_result to feed back to the LLM.
   */
  executeDrawOps(ops: DrawOp[], canvas: WhiteboardStore): ToolResult {
    this.state.transition('DRAWING');
    this.iteration++;

    // Validate
    const existingIds = new Set(canvas.getElements().keys());
    const { valid, errors } = validateOps(ops, existingIds);

    if (errors.length > 0 && valid.length === 0) {
      throw new DrawToolLoopError(
        `All ${errors.length} ops invalid: ${errors.map((e) => e.reason).join('; ')}`,
        errors,
      );
    }

    // Apply valid ops
    canvas.applyOps(valid);

    // Track committed elements
    const currentElements = Array.from(canvas.getElements().values());
    this.allCommittedElements = currentElements;

    // Build compact result
    return buildToolResult(currentElements, valid.length);
  }

  /**
   * After executing ops, decide whether to continue or finish.
   * Returns true if the loop should continue (feed result back to LLM).
   */
  continueOrFinish(done: boolean): 'continue' | 'finish' {
    if (done || this.isMaxIterations()) {
      this.finish();
      return 'finish';
    }
    // Loopback: DRAWING → PROCESSING for next LLM call
    this.state.transition('PROCESSING');
    return 'continue';
  }

  /** Finalise the loop back to IDLE with a summary turn. */
  finish(): void {
    const summary = `[Loop complete: ${this.iteration} iterations, ${this.allCommittedElements.length} elements on canvas]`;
    this.context.addTurn({ role: 'system', content: summary });
    this.state.transition('IDLE');
  }

  /**
   * Compact N previous tool calls into a single summary turn.
   */
  compactToolCalls(count: number, summary: string): void {
    const turns = this.context.getTurns();
    const start = Math.max(0, turns.length - count);
    this.context.compactToolCalls(start, turns.length, summary);
  }

  /** Full reset for a new session. */
  reset(): void {
    this.state.reset();
    this.iteration = 0;
    this.allCommittedElements = [];
    this.context.reset();
  }
}

// ── Error type ──────────────────────────────────────────────────────

export class DrawToolLoopError extends Error {
  constructor(
    message: string,
    public readonly validationErrors: ValidationError[],
  ) {
    super(message);
    this.name = 'DrawToolLoopError';
  }
}
