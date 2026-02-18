'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import type { Camera, DrawElement, ToolType } from '@/types';

interface WhiteboardState {
  elements: Map<string, DrawElement>;
  selectedIds: Set<string>;
  camera: Camera;
  activeTool: ToolType;
}

interface WhiteboardContextValue extends WhiteboardState {
  setElements: (elements: Map<string, DrawElement>) => void;
  setSelectedIds: (ids: Set<string>) => void;
  setCamera: (camera: Camera) => void;
  setActiveTool: (tool: ToolType) => void;
}

const WhiteboardContext = createContext<WhiteboardContextValue | null>(null);

export function WhiteboardProvider({ children }: { children: ReactNode }) {
  const [elements, setElements] = useState<Map<string, DrawElement>>(new Map());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, zoom: 1 });
  const [activeTool, setActiveTool] = useState<ToolType>('select');

  return (
    <WhiteboardContext.Provider
      value={{
        elements,
        selectedIds,
        camera,
        activeTool,
        setElements,
        setSelectedIds,
        setCamera,
        setActiveTool,
      }}
    >
      {children}
    </WhiteboardContext.Provider>
  );
}

export function useWhiteboard(): WhiteboardContextValue {
  const ctx = useContext(WhiteboardContext);
  if (!ctx) {
    throw new Error('useWhiteboard must be used within a WhiteboardProvider');
  }
  return ctx;
}
