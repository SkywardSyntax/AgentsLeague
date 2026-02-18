'use client';

import { useState, useCallback, useRef, type KeyboardEvent } from 'react';
import type { ToolType } from '@/types';
import { useTheme } from '@/hooks/useTheme';

const tools: { id: ToolType; label: string; icon: string }[] = [
  { id: 'select', label: 'Select', icon: '⊹' },
  { id: 'hand', label: 'Hand', icon: '✋' },
  { id: 'rect', label: 'Rectangle', icon: '▭' },
  { id: 'ellipse', label: 'Ellipse', icon: '◯' },
  { id: 'line', label: 'Line', icon: '╱' },
  { id: 'arrow', label: 'Arrow', icon: '→' },
  { id: 'freehand', label: 'Draw', icon: '✎' },
  { id: 'text', label: 'Text', icon: 'T' },
  { id: 'eraser', label: 'Eraser', icon: '◻' },
];

interface ToolbarProps {
  activeTool: ToolType;
  onToolChange: (tool: ToolType) => void;
}

export default function Toolbar({ activeTool, onToolChange }: ToolbarProps) {
  const { theme, toggleTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);

  const handleToolbarKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const buttons = toolbarRef.current?.querySelectorAll<HTMLButtonElement>(
        'button[role="radio"]',
      );
      if (!buttons?.length) return;

      const currentIndex = Array.from(buttons).findIndex(
        (btn) => btn === document.activeElement,
      );
      if (currentIndex === -1) return;

      let nextIndex = currentIndex;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        nextIndex = (currentIndex + 1) % buttons.length;
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        nextIndex = (currentIndex - 1 + buttons.length) % buttons.length;
      } else if (e.key === 'Home') {
        e.preventDefault();
        nextIndex = 0;
      } else if (e.key === 'End') {
        e.preventDefault();
        nextIndex = buttons.length - 1;
      }

      if (nextIndex !== currentIndex) {
        const btn = buttons[nextIndex];
        if (btn) {
          btn.focus();
          btn.click();
        }
      }
    },
    [],
  );

  return (
    <nav
      id="toolbar"
      aria-label="Drawing tools"
      className="fixed left-1/2 top-2 z-50 -translate-x-1/2 sm:top-4"
    >
      {/* Mobile hamburger toggle */}
      <button
        onClick={() => setMenuOpen(!menuOpen)}
        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl shadow-lg backdrop-blur-xl md:hidden"
        style={{ backgroundColor: `hsl(${theme === 'dark' ? '24 10% 10%' : '0 0% 100%'} / 0.8)` }}
        aria-label="Toggle toolbar"
        aria-expanded={menuOpen}
        aria-controls="toolbar-tools"
      >
        <span aria-hidden="true" className="text-lg">{menuOpen ? '✕' : '☰'}</span>
      </button>

      {/* Tool buttons: dropdown on mobile, horizontal bar on md+ */}
      <div
        id="toolbar-tools"
        ref={toolbarRef}
        role="radiogroup"
        aria-label="Drawing tool selection"
        onKeyDown={handleToolbarKeyDown}
        className={`${
          menuOpen ? 'flex' : 'hidden'
        } absolute left-1/2 top-full mt-2 -translate-x-1/2 flex-col items-stretch gap-1 rounded-xl p-2 shadow-lg backdrop-blur-xl md:relative md:top-auto md:mt-0 md:flex md:translate-x-0 md:flex-row md:items-center md:gap-1 md:px-3 md:py-2`}
        style={{ backgroundColor: `hsl(${theme === 'dark' ? '24 10% 10%' : '0 0% 100%'} / 0.8)` }}
      >
        {tools.map((tool, index) => (
          <button
            key={tool.id}
            role="radio"
            aria-checked={activeTool === tool.id}
            tabIndex={activeTool === tool.id ? 0 : -1}
            onClick={() => {
              onToolChange(tool.id);
              setMenuOpen(false);
            }}
            className={`flex min-h-[44px] items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-[120ms] md:min-h-0 md:justify-center md:gap-0 ${
              activeTool === tool.id
                ? 'bg-[var(--color-blue)] text-white'
                : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]'
            }`}
            aria-label={`${tool.label} tool${activeTool === tool.id ? ' (active)' : ''}`}
          >
            <span className="text-base md:hidden" aria-hidden="true">{tool.icon}</span>
            <span>{tool.label}</span>
          </button>
        ))}

        {/* Separator */}
        <div
          className="mx-1 hidden h-6 w-px md:block"
          style={{ backgroundColor: 'hsl(var(--color-border-subtle))' }}
          role="separator"
          aria-orientation="vertical"
        />

        {/* Dark mode toggle */}
        <button
          onClick={toggleTheme}
          className="min-h-[44px] rounded-lg px-2.5 py-1.5 text-sm transition-colors duration-[120ms] text-[color:hsl(var(--color-text-secondary))] hover:bg-[hsl(var(--color-surface-raised))] md:min-h-0"
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          <span aria-hidden="true">{theme === 'dark' ? '☀️' : '🌙'}</span>
        </button>
      </div>
    </nav>
  );
}
