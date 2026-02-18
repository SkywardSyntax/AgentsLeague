'use client';

import { useEffect, useRef } from 'react';
import { useConversationStore } from '@/stores/conversation-store';
import { useDrawingSessionStore } from '@/stores/drawing-session';
import { useWhiteboard } from '@/stores/whiteboard-store';
import type { DrawElement, Camera, ToolType } from '@/types';

// ── Constants ───────────────────────────────────────────────────────

const STORAGE_KEY = 'agents-league:session';
const CHANNEL_NAME = 'agents-league:sync';
const DEBOUNCE_MS = 1_000;

// ── Serialisable snapshot types ─────────────────────────────────────

interface SessionSnapshot {
  ts: number;
  conversation: {
    messages: ReturnType<typeof useConversationStore.getState>['messages'];
    mode: ReturnType<typeof useConversationStore.getState>['mode'];
  };
  drawingSession: {
    canvasSnapshot: ReturnType<typeof useDrawingSessionStore.getState>['canvasSnapshot'];
    toolCalls: ReturnType<typeof useDrawingSessionStore.getState>['toolCalls'];
  };
  whiteboard: {
    elements: [string, DrawElement][];
    camera: Camera;
    activeTool: ToolType;
  };
}

// ── Helpers ─────────────────────────────────────────────────────────

function captureSnapshot(
  whiteboard: { elements: Map<string, DrawElement>; camera: Camera; activeTool: ToolType },
): SessionSnapshot {
  const conv = useConversationStore.getState();
  const ds = useDrawingSessionStore.getState();

  return {
    ts: Date.now(),
    conversation: {
      messages: conv.messages,
      mode: conv.mode,
    },
    drawingSession: {
      canvasSnapshot: ds.canvasSnapshot,
      toolCalls: ds.toolCalls,
    },
    whiteboard: {
      elements: Array.from(whiteboard.elements.entries()),
      camera: whiteboard.camera,
      activeTool: whiteboard.activeTool,
    },
  };
}

function persistSnapshot(snapshot: SessionSnapshot): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Storage full or unavailable — silently ignore
  }
}

function loadSnapshot(): SessionSnapshot | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SessionSnapshot;
  } catch {
    return null;
  }
}

// ── Hook ────────────────────────────────────────────────────────────

export function useSessionSync(): void {
  const whiteboard = useWhiteboard();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);

  // Stable ref so the save closure always sees latest whiteboard state
  const wbRef = useRef(whiteboard);
  wbRef.current = whiteboard;

  // ── Restore on mount ──────────────────────────────────────────────
  useEffect(() => {
    const snapshot = loadSnapshot();
    if (!snapshot) return;

    // Conversation store
    const conv = useConversationStore.getState();
    conv.setMode(snapshot.conversation.mode);
    for (const _msg of snapshot.conversation.messages) {
      // Only restore if store is empty (first load)
      if (useConversationStore.getState().messages.length === 0) {
        useConversationStore.setState({ messages: snapshot.conversation.messages });
        break;
      }
    }

    // Drawing session store
    useDrawingSessionStore.setState({
      canvasSnapshot: snapshot.drawingSession.canvasSnapshot,
      toolCalls: snapshot.drawingSession.toolCalls,
    });

    // Whiteboard context
    whiteboard.setElements(new Map(snapshot.whiteboard.elements));
    whiteboard.setCamera(snapshot.whiteboard.camera);
    whiteboard.setActiveTool(snapshot.whiteboard.activeTool);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount

  // ── Debounced save helper ─────────────────────────────────────────
  useEffect(() => {
    const scheduleSave = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const snapshot = captureSnapshot(wbRef.current);
        persistSnapshot(snapshot);

        // Broadcast to other tabs (last-write-wins via `ts`)
        try {
          channelRef.current?.postMessage(snapshot);
        } catch {
          // Channel may be closed
        }
      }, DEBOUNCE_MS);
    };

    // Subscribe to zustand stores
    const unsubConv = useConversationStore.subscribe(scheduleSave);
    const unsubDs = useDrawingSessionStore.subscribe(scheduleSave);

    return () => {
      unsubConv();
      unsubDs();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Re-schedule save whenever whiteboard context values change
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const snapshot = captureSnapshot(wbRef.current);
      persistSnapshot(snapshot);
      try {
        channelRef.current?.postMessage(snapshot);
      } catch {
        // Channel may be closed
      }
    }, DEBOUNCE_MS);
  }, [whiteboard.elements, whiteboard.camera, whiteboard.activeTool]);

  // ── BroadcastChannel for cross-tab sync ───────────────────────────
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;

    const channel = new BroadcastChannel(CHANNEL_NAME);
    channelRef.current = channel;

    channel.onmessage = (event: MessageEvent<SessionSnapshot>) => {
      const incoming = event.data;
      if (!incoming?.ts) return;

      // Last-write-wins: only apply if incoming is newer
      const local = loadSnapshot();
      if (local && local.ts >= incoming.ts) return;

      persistSnapshot(incoming);

      // Apply to stores
      useConversationStore.setState({
        messages: incoming.conversation.messages,
        mode: incoming.conversation.mode,
      });

      useDrawingSessionStore.setState({
        canvasSnapshot: incoming.drawingSession.canvasSnapshot,
        toolCalls: incoming.drawingSession.toolCalls,
      });

      wbRef.current.setElements(new Map(incoming.whiteboard.elements));
      wbRef.current.setCamera(incoming.whiteboard.camera);
      wbRef.current.setActiveTool(incoming.whiteboard.activeTool);
    };

    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, []);

  // ── Save on tab/window close ──────────────────────────────────────
  useEffect(() => {
    const handleUnload = () => {
      const snapshot = captureSnapshot(wbRef.current);
      persistSnapshot(snapshot);
    };

    window.addEventListener('beforeunload', handleUnload);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') handleUnload();
    });

    return () => {
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, []);
}
