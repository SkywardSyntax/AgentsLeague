'use client';

import type { ToolType } from '@/types';

const tools: { id: ToolType; label: string }[] = [
  { id: 'select', label: 'Select' },
  { id: 'hand', label: 'Hand' },
  { id: 'rect', label: 'Rectangle' },
  { id: 'ellipse', label: 'Ellipse' },
  { id: 'line', label: 'Line' },
  { id: 'arrow', label: 'Arrow' },
  { id: 'freehand', label: 'Draw' },
  { id: 'text', label: 'Text' },
  { id: 'eraser', label: 'Eraser' },
];

interface ToolbarProps {
  activeTool: ToolType;
  onToolChange: (tool: ToolType) => void;
}

export default function Toolbar({ activeTool, onToolChange }: ToolbarProps) {
  return (
    <div className="fixed left-1/2 top-4 z-50 flex -translate-x-1/2 items-center gap-1 rounded-xl bg-white/80 px-3 py-2 shadow-lg backdrop-blur-xl dark:bg-[var(--color-surface)]/80">
      {tools.map((tool) => (
        <button
          key={tool.id}
          onClick={() => onToolChange(tool.id)}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-[120ms] ${
            activeTool === tool.id
              ? 'bg-[var(--color-blue)] text-white'
              : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]'
          }`}
          aria-label={tool.label}
          aria-pressed={activeTool === tool.id}
        >
          {tool.label}
        </button>
      ))}
    </div>
  );
}
