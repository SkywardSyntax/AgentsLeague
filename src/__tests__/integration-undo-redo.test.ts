/**
 * Integration tests: Undo/redo across canvas + chat history.
 *
 * Tests CommandHistory, useHistory hook logic, and
 * cross-cutting undo/redo with conversation store.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CommandHistory, MoveCommand, PropertyChangeCommand } from '@/lib/history/CommandHistory';
import type { Command } from '@/lib/history/CommandHistory';
import { useConversationStore } from '@/stores/conversation-store';
import { useDrawingSessionStore } from '@/stores/drawing-session';
import { InteractionMode, MessageRole } from '@/types/interaction';
import type { DrawOp, RectElement, HistoryStack, HistoryEntry } from '@/types/drawing';
import { createMockWhiteboardStore } from '@/lib/test-utils/helpers';
import { rectElement } from '@/lib/test-utils/fixtures';

// ── Helpers ─────────────────────────────────────────────────────

function resetStores() {
  useConversationStore.setState({
    messages: [],
    mode: InteractionMode.TEXT,
    isProcessing: false,
  });
  useDrawingSessionStore.getState().reset();
}

function makeRect(id: string, x = 100, y = 200): RectElement {
  return { ...rectElement, id, x, y, createdAt: Date.now(), updatedAt: Date.now() };
}

/** Simulates the useHistory hook logic without React hooks. */
function createHistoryStack(): {
  push: (ops: DrawOp[], inverseOps: DrawOp[]) => void;
  undo: () => DrawOp[] | null;
  redo: () => DrawOp[] | null;
  canUndo: () => boolean;
  canRedo: () => boolean;
  stack: HistoryStack;
} {
  const stack: HistoryStack = { entries: [], pointer: -1 };

  return {
    push(ops: DrawOp[], inverseOps: DrawOp[]) {
      stack.entries = stack.entries.slice(0, stack.pointer + 1);
      const entry: HistoryEntry = { timestamp: Date.now(), ops, inverseOps };
      stack.entries.push(entry);
      stack.pointer = stack.entries.length - 1;
    },
    undo(): DrawOp[] | null {
      if (stack.pointer < 0) return null;
      const entry = stack.entries[stack.pointer];
      if (!entry) return null;
      stack.pointer--;
      return entry.inverseOps;
    },
    redo(): DrawOp[] | null {
      if (stack.pointer >= stack.entries.length - 1) return null;
      stack.pointer++;
      const entry = stack.entries[stack.pointer];
      if (!entry) return null;
      return entry.ops;
    },
    canUndo: () => stack.pointer >= 0,
    canRedo: () => stack.pointer < stack.entries.length - 1,
    stack,
  };
}

// ── Tests ───────────────────────────────────────────────────────

describe('Integration: Undo/Redo Across Canvas + Chat', () => {
  beforeEach(() => {
    resetStores();
  });

  // ── CommandHistory class ────────────────────────────────────

  describe('CommandHistory', () => {
    it('executes, undoes, and redoes commands', () => {
      const history = new CommandHistory();
      const values: number[] = [];

      const cmd: Command = {
        type: 'test',
        execute: () => values.push(1),
        undo: () => { values.pop(); },
      };

      history.push(cmd);
      expect(values).toEqual([1]);
      expect(history.canUndo()).toBe(true);
      expect(history.canRedo()).toBe(false);

      history.undo();
      expect(values).toEqual([]);
      expect(history.canUndo()).toBe(false);
      expect(history.canRedo()).toBe(true);

      history.redo();
      expect(values).toEqual([1]);
    });

    it('clears redo stack on new push', () => {
      const history = new CommandHistory();
      let value = 0;

      history.push({
        type: 'inc',
        execute: () => { value += 1; },
        undo: () => { value -= 1; },
      });
      history.push({
        type: 'inc',
        execute: () => { value += 10; },
        undo: () => { value -= 10; },
      });
      expect(value).toBe(11);

      history.undo(); // value = 1
      expect(value).toBe(1);
      expect(history.canRedo()).toBe(true);

      // New push clears redo
      history.push({
        type: 'inc',
        execute: () => { value += 100; },
        undo: () => { value -= 100; },
      });
      expect(value).toBe(101);
      expect(history.canRedo()).toBe(false);
    });

    it('handles batch operations as single undo step', () => {
      const history = new CommandHistory();
      const values: string[] = [];

      history.startBatch();
      history.push({
        type: 'add',
        execute: () => values.push('a'),
        undo: () => { values.pop(); },
      });
      history.push({
        type: 'add',
        execute: () => values.push('b'),
        undo: () => { values.pop(); },
      });
      history.push({
        type: 'add',
        execute: () => values.push('c'),
        undo: () => { values.pop(); },
      });
      history.endBatch();

      expect(values).toEqual(['a', 'b', 'c']);
      expect(history.undoSize).toBe(1); // Single batch entry

      // Undo entire batch
      history.undo();
      expect(values).toEqual([]);

      // Redo entire batch
      history.redo();
      expect(values).toEqual(['a', 'b', 'c']);
    });

    it('merges consecutive move commands', () => {
      const history = new CommandHistory();
      const positions = new Map<string, { x: number; y: number }>();
      positions.set('elem-1', { x: 0, y: 0 });

      const applyMove = (id: string, dx: number, dy: number) => {
        const pos = positions.get(id)!;
        positions.set(id, { x: pos.x + dx, y: pos.y + dy });
      };

      history.push(new MoveCommand('elem-1', 10, 5, applyMove));
      history.push(new MoveCommand('elem-1', 20, 10, applyMove));
      history.push(new MoveCommand('elem-1', 30, 15, applyMove));

      // All merged into one
      expect(history.undoSize).toBe(1);
      expect(positions.get('elem-1')).toEqual({ x: 60, y: 30 });

      // Single undo reverts all
      history.undo();
      expect(positions.get('elem-1')).toEqual({ x: 0, y: 0 });
    });

    it('does not merge moves for different elements', () => {
      const history = new CommandHistory();
      const positions = new Map<string, { x: number; y: number }>();
      positions.set('a', { x: 0, y: 0 });
      positions.set('b', { x: 0, y: 0 });

      const applyMove = (id: string, dx: number, dy: number) => {
        const pos = positions.get(id)!;
        positions.set(id, { x: pos.x + dx, y: pos.y + dy });
      };

      history.push(new MoveCommand('a', 10, 10, applyMove));
      history.push(new MoveCommand('b', 20, 20, applyMove));

      expect(history.undoSize).toBe(2);
    });

    it('enforces max depth of 200', () => {
      const history = new CommandHistory();
      let _value = 0;

      for (let i = 0; i < 250; i++) {
        const inc = i;
        history.push({
          type: `unique-${i}`, // prevent merging
          execute: () => { _value += inc; },
          undo: () => { _value -= inc; },
        });
      }

      expect(history.undoSize).toBe(200);
    });

    it('clears all history', () => {
      const history = new CommandHistory();
      history.push({
        type: 'test',
        execute: () => { /* noop */ },
        undo: () => { /* noop */ },
      });
      history.push({
        type: 'test2',
        execute: () => { /* noop */ },
        undo: () => { /* noop */ },
      });

      history.clear();
      expect(history.undoSize).toBe(0);
      expect(history.redoSize).toBe(0);
      expect(history.canUndo()).toBe(false);
      expect(history.canRedo()).toBe(false);
    });
  });

  // ── DrawOp history (useHistory logic) ───────────────────────

  describe('DrawOp History Stack', () => {
    it('pushes and undoes add operations', () => {
      const store = createMockWhiteboardStore();
      const historyStack = createHistoryStack();
      const rect = makeRect('h-rect-1');

      // Add element
      const addOp: DrawOp = { op: 'add', element: rect };
      const inverseOp: DrawOp = { op: 'delete', id: rect.id };

      store.applyOps([addOp]);
      historyStack.push([addOp], [inverseOp]);

      expect(store.getElements().has('h-rect-1')).toBe(true);
      expect(historyStack.canUndo()).toBe(true);

      // Undo → delete
      const undoOps = historyStack.undo();
      expect(undoOps).toBeDefined();
      store.applyOps(undoOps!);
      expect(store.getElements().has('h-rect-1')).toBe(false);

      // Redo → add back
      const redoOps = historyStack.redo();
      expect(redoOps).toBeDefined();
      store.applyOps(redoOps!);
      expect(store.getElements().has('h-rect-1')).toBe(true);
    });

    it('undoes and redoes update operations', () => {
      const rect = makeRect('h-rect-2', 100, 200);
      const store = createMockWhiteboardStore([rect]);
      const historyStack = createHistoryStack();

      // Move element
      const updateOp: DrawOp = { op: 'update', id: 'h-rect-2', patch: { x: 500, y: 600 } };
      const inverseOp: DrawOp = { op: 'update', id: 'h-rect-2', patch: { x: 100, y: 200 } };

      store.applyOps([updateOp]);
      historyStack.push([updateOp], [inverseOp]);

      expect(store.getElements().get('h-rect-2')!.x).toBe(500);

      // Undo
      const undoOps = historyStack.undo();
      store.applyOps(undoOps!);
      expect(store.getElements().get('h-rect-2')!.x).toBe(100);
      expect(store.getElements().get('h-rect-2')!.y).toBe(200);
    });

    it('handles multi-step undo across operations', () => {
      const store = createMockWhiteboardStore();
      const historyStack = createHistoryStack();

      // Step 1: Add rect
      const rect1 = makeRect('multi-1');
      store.applyOps([{ op: 'add', element: rect1 }]);
      historyStack.push(
        [{ op: 'add', element: rect1 }],
        [{ op: 'delete', id: 'multi-1' }],
      );

      // Step 2: Add another rect
      const rect2 = makeRect('multi-2', 300, 400);
      store.applyOps([{ op: 'add', element: rect2 }]);
      historyStack.push(
        [{ op: 'add', element: rect2 }],
        [{ op: 'delete', id: 'multi-2' }],
      );

      // Step 3: Move first rect
      store.applyOps([{ op: 'update', id: 'multi-1', patch: { x: 999 } }]);
      historyStack.push(
        [{ op: 'update', id: 'multi-1', patch: { x: 999 } }],
        [{ op: 'update', id: 'multi-1', patch: { x: 100 } }],
      );

      expect(store.getElements().size).toBe(2);
      expect(store.getElements().get('multi-1')!.x).toBe(999);

      // Undo step 3: revert move
      store.applyOps(historyStack.undo()!);
      expect(store.getElements().get('multi-1')!.x).toBe(100);

      // Undo step 2: remove rect2
      store.applyOps(historyStack.undo()!);
      expect(store.getElements().size).toBe(1);
      expect(store.getElements().has('multi-2')).toBe(false);

      // Undo step 1: remove rect1
      store.applyOps(historyStack.undo()!);
      expect(store.getElements().size).toBe(0);

      // Can't undo further
      expect(historyStack.canUndo()).toBe(false);
      expect(historyStack.undo()).toBeNull();

      // Redo all 3 steps
      store.applyOps(historyStack.redo()!);
      store.applyOps(historyStack.redo()!);
      store.applyOps(historyStack.redo()!);
      expect(store.getElements().size).toBe(2);
      expect(store.getElements().get('multi-1')!.x).toBe(999);
    });

    it('truncates redo stack on new push after undo', () => {
      const store = createMockWhiteboardStore();
      const historyStack = createHistoryStack();

      // Add rect1 and rect2
      const rect1 = makeRect('trunc-1');
      const rect2 = makeRect('trunc-2');
      store.applyOps([{ op: 'add', element: rect1 }]);
      historyStack.push([{ op: 'add', element: rect1 }], [{ op: 'delete', id: 'trunc-1' }]);
      store.applyOps([{ op: 'add', element: rect2 }]);
      historyStack.push([{ op: 'add', element: rect2 }], [{ op: 'delete', id: 'trunc-2' }]);

      // Undo rect2
      store.applyOps(historyStack.undo()!);
      expect(historyStack.canRedo()).toBe(true);

      // Push new operation → clears redo
      const rect3 = makeRect('trunc-3');
      store.applyOps([{ op: 'add', element: rect3 }]);
      historyStack.push([{ op: 'add', element: rect3 }], [{ op: 'delete', id: 'trunc-3' }]);

      expect(historyStack.canRedo()).toBe(false);
      // Stack should have: rect1, rect3 (rect2 redo truncated)
      expect(historyStack.stack.entries).toHaveLength(2);
    });
  });

  // ── Cross-cutting: Canvas undo + chat history ───────────────

  describe('Canvas + Chat History Cross-cutting', () => {
    it('links drawing ops to conversation messages for coordinated undo', () => {
      const store = createMockWhiteboardStore();
      const historyStack = createHistoryStack();
      const convStore = useConversationStore.getState();

      // User says "draw a rectangle"
      convStore.addMessage('Draw a rectangle', MessageRole.USER);

      // AI responds with drawing
      const rect = makeRect('chat-rect-1');
      store.applyOps([{ op: 'add', element: rect }]);
      historyStack.push(
        [{ op: 'add', element: rect }],
        [{ op: 'delete', id: 'chat-rect-1' }],
      );

      const _assistantMsg = convStore.addMessage("I've drawn a rectangle.", MessageRole.ASSISTANT, {
        drawing: {
          action: 'create',
          objects: [{ type: 'rect', id: 'chat-rect-1', props: {} }],
        },
        meta: { streamComplete: true, drawObjectIds: ['chat-rect-1'] },
      });

      // Verify both stores have data
      expect(store.getElements().has('chat-rect-1')).toBe(true);
      const messages = useConversationStore.getState().messages;
      expect(messages).toHaveLength(2);
      expect(messages[1]!.meta?.drawObjectIds).toContain('chat-rect-1');

      // Undo canvas drawing
      store.applyOps(historyStack.undo()!);
      expect(store.getElements().has('chat-rect-1')).toBe(false);

      // Message still exists (chat history is separate)
      expect(useConversationStore.getState().messages).toHaveLength(2);
    });

    it('supports deleting message and undoing its associated drawing', () => {
      const store = createMockWhiteboardStore();
      const convStore = useConversationStore.getState();
      const historyStack = createHistoryStack();

      const rect = makeRect('del-rect-1');
      store.applyOps([{ op: 'add', element: rect }]);
      historyStack.push(
        [{ op: 'add', element: rect }],
        [{ op: 'delete', id: 'del-rect-1' }],
      );

      convStore.addMessage('Draw something', MessageRole.USER);
      const msg = convStore.addMessage('Done!', MessageRole.ASSISTANT, {
        meta: { drawObjectIds: ['del-rect-1'] },
      });

      // Delete message
      convStore.deleteMessage(msg.id);
      expect(useConversationStore.getState().messages).toHaveLength(1);

      // Undo drawing
      store.applyOps(historyStack.undo()!);
      expect(store.getElements().has('del-rect-1')).toBe(false);
    });

    it('handles clear history affecting both canvas and chat', () => {
      const store = createMockWhiteboardStore([makeRect('clear-1'), makeRect('clear-2')]);
      const convStore = useConversationStore.getState();

      convStore.addMessage('msg 1', MessageRole.USER);
      convStore.addMessage('msg 2', MessageRole.ASSISTANT);

      expect(store.getElements().size).toBe(2);
      expect(useConversationStore.getState().messages).toHaveLength(2);

      // Clear both
      store.applyOps([{ op: 'clear' }]);
      convStore.clearHistory();

      expect(store.getElements().size).toBe(0);
      expect(useConversationStore.getState().messages).toHaveLength(0);
    });
  });

  // ── PropertyChangeCommand ───────────────────────────────────

  describe('PropertyChangeCommand', () => {
    it('changes and reverts a property', () => {
      const history = new CommandHistory();
      const props: Record<string, Record<string, unknown>> = {
        'elem-1': { color: '#000000' },
      };

      const applyChange = (id: string, prop: string, value: unknown) => {
        props[id]![prop] = value;
      };

      history.push(
        new PropertyChangeCommand('elem-1', 'color', '#000000', '#FF0000', applyChange),
      );
      expect(props['elem-1']!.color).toBe('#FF0000');

      history.undo();
      expect(props['elem-1']!.color).toBe('#000000');

      history.redo();
      expect(props['elem-1']!.color).toBe('#FF0000');
    });
  });
});
