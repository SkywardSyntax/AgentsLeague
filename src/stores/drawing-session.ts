'use client';

import { create } from 'zustand';
import type { DrawElement, DrawOp } from '@/types';
import type { WhiteboardState } from '@/types/state';
import { buildToolResult, type ToolResult } from '@/lib/tool-workflow/ToolResultBuilder';

// ── Types ───────────────────────────────────────────────────────────

interface ToolCallRecord {
  readonly id: string;
  readonly ops: readonly DrawOp[];
  readonly timestamp: number;
}

interface DrawingSessionStore {
  drawingState: WhiteboardState;
  toolLoopIteration: number;
  canvasSnapshot: DrawElement[];
  toolCalls: ToolCallRecord[];

  addToolCall: (ops: DrawOp[]) => void;
  commitOps: (ops: DrawOp[]) => void;
  reset: () => void;
  computeToolResult: () => ToolResult;
  setDrawingState: (state: WhiteboardState) => void;
}

// ── Helpers ─────────────────────────────────────────────────────────

function applyOpsToSnapshot(
  snapshot: DrawElement[],
  ops: DrawOp[],
): DrawElement[] {
  const elements = new Map<string, DrawElement>(
    snapshot.map((el) => [el.id, el]),
  );

  for (const op of ops) {
    switch (op.op) {
      case 'add':
        elements.set(op.element.id, op.element);
        break;
      case 'update': {
        const existing = elements.get(op.id);
        if (existing) {
          elements.set(op.id, { ...existing, ...op.patch } as DrawElement);
        }
        break;
      }
      case 'delete':
        elements.delete(op.id);
        break;
      case 'clear':
        elements.clear();
        break;
    }
  }

  return Array.from(elements.values());
}

// ── Store ───────────────────────────────────────────────────────────

export const useDrawingSessionStore = create<DrawingSessionStore>(
  (set, get) => ({
    drawingState: { status: 'idle' } as WhiteboardState,
    toolLoopIteration: 0,
    canvasSnapshot: [],
    toolCalls: [],

    addToolCall: (ops) => {
      const record: ToolCallRecord = {
        id: crypto.randomUUID(),
        ops,
        timestamp: Date.now(),
      };
      set((state) => ({
        toolCalls: [...state.toolCalls, record],
        toolLoopIteration: state.toolLoopIteration + 1,
      }));
    },

    commitOps: (ops) => {
      set((state) => ({
        canvasSnapshot: applyOpsToSnapshot(state.canvasSnapshot, ops),
      }));
    },

    reset: () =>
      set({
        drawingState: { status: 'idle' } as WhiteboardState,
        toolLoopIteration: 0,
        canvasSnapshot: [],
        toolCalls: [],
      }),

    computeToolResult: () => {
      const { canvasSnapshot, toolCalls } = get();
      const lastOpsCount =
        toolCalls.length > 0
          ? toolCalls[toolCalls.length - 1]!.ops.length
          : 0;
      return buildToolResult(canvasSnapshot, lastOpsCount);
    },

    setDrawingState: (drawingState) => set({ drawingState }),
  }),
);
