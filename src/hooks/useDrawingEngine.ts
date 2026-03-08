'use client';

import { startTransition, useCallback, useRef, useState } from 'react';
import { useDrawHistory } from './useDrawHistory';
import { useScenePersistence } from './useScenePersistence';
import type { ChatSessionState } from './useSessionManager';
import type { DrawBatch, DrawElement } from '@/types/agent';
// Types inlined from deleted DrawingStatistics / DrawingStatusPill components
export type DrawSource = 'None' | 'AI' | 'Template' | 'Injected';
export type DrawingPillState =
  | { kind: 'idle' }
  | { kind: 'ai_drawing'; elementCount: number; typeCounts: Record<string, number> }
  | { kind: 'done'; shapeCount: number; typeCounts?: Record<string, number> };
import type { StreamPhase, DrawingProgressInfo } from '@/components/chat/StreamProgress';
import type { NotificationItem } from '@/components/app/WarningOverlay';
import { fromLegacyDrawBatchToSemanticStub } from '@/lib/whiteboard/planner';
import { rebuildSceneFromBatches } from './useChatSessions';

export interface UseDrawingEngineParams {
  activeChatId: string;
  activeChat: ChatSessionState | undefined;
  setChatSessions: React.Dispatch<React.SetStateAction<ChatSessionState[]>>;
  activeChatIdRef: React.RefObject<string>;
  pushWarning: (warning: string, targetChatId: string, severity?: NotificationItem['severity']) => void;
}

export function useDrawingEngine({
  activeChatId,
  activeChat,
  setChatSessions,
  activeChatIdRef,
  pushWarning,
}: UseDrawingEngineParams) {
  // ─── Drawing progress tracking ─────────────────────────────────
  const [drawingElementCount, setDrawingElementCount] = useState(0);
  const [drawingTypeCounts, setDrawingTypeCounts] = useState<Partial<Record<DrawElement['type'], number>>>({});
  const [batchJustCompleted, setBatchJustCompleted] = useState(false);
  const [lastDrawSource, setLastDrawSource] = useState<DrawSource>('None');
  const [drawingPillState, setDrawingPillState] = useState<DrawingPillState>({ kind: 'idle' });
  const batchCompletionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Undo / Redo history ───────────────────────────────────────
  const {
    canUndo, canRedo,
    pushState: pushHistoryState,
    undo: historyUndo,
    redo: historyRedo,
  } = useDrawHistory(activeChatId, activeChat?.batches ?? []);

  // Stable refs so the streaming event handler can call pushState
  // without a stale closure.
  const pushHistoryRef = useRef(pushHistoryState);
  pushHistoryRef.current = pushHistoryState;
  const activeBatchesRef = useRef<DrawBatch[]>(activeChat?.batches ?? []);
  if (activeChat) activeBatchesRef.current = activeChat.batches;

  // ─── Scene persistence ─────────────────────────────────────────
  const {
    savedSceneExists,
    restoreScene,
    clearSavedScene,
    snapshots,
    saveSnapshot,
    restoreSnapshot,
    deleteSnapshot,
  } = useScenePersistence(activeChat?.batches ?? []);

  // ─── Drawing progress operations (called by stream orchestrator)

  const resetDrawingProgress = useCallback(() => {
    if (batchCompletionTimerRef.current) {
      clearTimeout(batchCompletionTimerRef.current);
      batchCompletionTimerRef.current = null;
    }
    setDrawingElementCount(0);
    setDrawingTypeCounts({});
    setBatchJustCompleted(false);
    setDrawingPillState({ kind: 'idle' });
  }, []);

  const trackBatchElements = useCallback((elements: DrawElement[]) => {
    const drawableElements = elements.filter((el) => el.type !== 'clear');
    const batchTypeCounts: Partial<Record<DrawElement['type'], number>> = {};
    for (const el of drawableElements) {
      batchTypeCounts[el.type] = (batchTypeCounts[el.type] ?? 0) + 1;
    }
    setDrawingElementCount((prev) => prev + drawableElements.length);
    setDrawingTypeCounts((prev) => {
      const merged = { ...prev };
      for (const [type, count] of Object.entries(batchTypeCounts)) {
        const key = type as DrawElement['type'];
        merged[key] = (merged[key] ?? 0) + (count ?? 0);
      }
      return merged;
    });
    setLastDrawSource('AI');
    setDrawingPillState({
      kind: 'ai_drawing',
      elementCount: drawableElements.length,
      typeCounts: batchTypeCounts,
    });
  }, []);

  const flashBatchCompletion = useCallback(() => {
    setBatchJustCompleted(true);
    if (batchCompletionTimerRef.current) clearTimeout(batchCompletionTimerRef.current);
    batchCompletionTimerRef.current = setTimeout(() => {
      batchCompletionTimerRef.current = null;
      setBatchJustCompleted(false);
    }, 1500);
  }, []);

  const finishDrawingTurn = useCallback((sawToolBatch: boolean) => {
    if (sawToolBatch) {
      setDrawingPillState((prev: DrawingPillState) =>
        prev.kind === 'ai_drawing'
          ? { kind: 'done', shapeCount: prev.elementCount, typeCounts: prev.typeCounts }
          : { kind: 'done', shapeCount: 0 },
      );
    }
  }, []);

  // ─── Undo / Redo operations ────────────────────────────────────

  const restoreFromBatches = useCallback(
    (batches: DrawBatch[]) => {
      const scene = rebuildSceneFromBatches(batches);
      const semanticScene = batches
        .map((b) => fromLegacyDrawBatchToSemanticStub(b.batch_id, b.elements))
        .slice(-80);
      setChatSessions((prev) =>
        prev.map((chat) => {
          if (chat.id !== activeChatIdRef.current) return chat;
          return { ...chat, updatedAt: Date.now(), batches, scene, semanticScene };
        }),
      );
    },
    [setChatSessions, activeChatIdRef],
  );

  const handleUndo = useCallback(
    (status: string) => {
      if (status !== 'idle') return;
      const batches = historyUndo();
      if (batches) restoreFromBatches(batches);
    },
    [historyUndo, restoreFromBatches],
  );

  const handleRedo = useCallback(
    (status: string) => {
      if (status !== 'idle') return;
      const batches = historyRedo();
      if (batches) restoreFromBatches(batches);
    },
    [historyRedo, restoreFromBatches],
  );

  // ─── Draw injection ────────────────────────────────────────────

  const handleDrawInject = useCallback(
    (batch: DrawBatch) => {
      if (!activeChat) return;
      pushHistoryState(activeChat.batches);

      const source: DrawSource = batch.batch_id.startsWith('tpl-') ? 'Template' : 'Injected';

      startTransition(() => {
        setLastDrawSource(source);
        const drawableEls = batch.elements.filter((el) => el.type !== 'clear');
        const injectCount = drawableEls.length;
        const injectTypeCounts: Partial<Record<DrawElement['type'], number>> = {};
        for (const el of drawableEls) {
          injectTypeCounts[el.type] = (injectTypeCounts[el.type] ?? 0) + 1;
        }
        setDrawingPillState({ kind: 'done', shapeCount: injectCount, typeCounts: injectTypeCounts });

        const typeBreakdown = Object.entries(injectTypeCounts)
          .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))
          .slice(0, 3)
          .map(([type, count]) => `${count} ${type}`)
          .join(', ');
        const toastMsg = typeBreakdown
          ? `✓ Injected ${injectCount} element${injectCount !== 1 ? 's' : ''} (${typeBreakdown})`
          : `✓ ${injectCount} element${injectCount !== 1 ? 's' : ''} injected`;
        pushWarning(toastMsg, activeChat.id, 'success');
      });

      const hasClear = batch.elements.some((el) => el.type === 'clear');
      setChatSessions((prev) =>
        prev.map((chat) => {
          if (chat.id !== activeChat.id) return chat;
          const baseScene = hasClear ? [] : [...chat.scene];
          batch.elements.forEach((element) => {
            if (element.type !== 'clear') baseScene.push(element);
          });
          const semanticBatch = fromLegacyDrawBatchToSemanticStub(batch.batch_id, batch.elements);
          return {
            ...chat,
            updatedAt: Date.now(),
            scene: baseScene,
            semanticScene: [...chat.semanticScene, semanticBatch].slice(-80),
            batches: [...chat.batches, batch],
          };
        }),
      );
    },
    [activeChat, pushHistoryState, pushWarning, setChatSessions],
  );

  // ─── Copy scene as JSON ────────────────────────────────────────

  const handleCopySceneJson = useCallback(() => {
    const scene = activeChat?.scene ?? [];
    const batch: DrawBatch = {
      batch_id: `export-${Date.now()}`,
      elements: scene,
      source: 'injection' as const,
      schemaVersion: 1,
    };
    navigator.clipboard.writeText(JSON.stringify(batch, null, 2)).then(
      () => {
        const targetId = activeChatIdRef.current;
        if (targetId) {
          pushWarning(`✓ Copied ${scene.length} element${scene.length !== 1 ? 's' : ''} as JSON`, targetId, 'success');
        }
      },
      () => {
        const targetId = activeChatIdRef.current;
        if (targetId) {
          pushWarning('Failed to copy to clipboard', targetId, 'error');
        }
      },
    );
  }, [activeChat?.scene, activeChatIdRef, pushWarning]);

  // ─── Computed values ───────────────────────────────────────────

  const computeStreamPhase = useCallback(
    (status: 'idle' | 'thinking' | 'streaming' | 'drawing'): StreamPhase | undefined => {
      return status === 'thinking'
        ? 'thinking'
        : status === 'streaming'
          ? 'streaming_text'
          : status === 'drawing'
            ? 'drawing'
            : undefined;
    },
    [],
  );

  const computeDrawingProgress = useCallback(
    (status: 'idle' | 'thinking' | 'streaming' | 'drawing'): DrawingProgressInfo | undefined => {
      return status === 'drawing'
        ? { elementCount: drawingElementCount, typeCounts: drawingTypeCounts, batchJustCompleted }
        : undefined;
    },
    [drawingElementCount, drawingTypeCounts, batchJustCompleted],
  );

  return {
    // Drawing progress state
    drawingPillState,
    lastDrawSource,

    // Drawing progress operations (for stream orchestrator)
    resetDrawingProgress,
    trackBatchElements,
    flashBatchCompletion,
    finishDrawingTurn,

    // Undo/redo
    canUndo,
    canRedo,
    pushHistoryState,
    pushHistoryRef,
    activeBatchesRef,
    handleUndo,
    handleRedo,
    restoreFromBatches,

    // Scene persistence
    savedSceneExists,
    restoreScene,
    clearSavedScene,
    snapshots,
    saveSnapshot,
    restoreSnapshot,
    deleteSnapshot,

    // Draw operations
    handleDrawInject,
    handleCopySceneJson,

    // Computed
    computeStreamPhase,
    computeDrawingProgress,
  };
}

export type DrawingEngine = ReturnType<typeof useDrawingEngine>;
