'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { useWhiteboard } from '@/stores/whiteboard-store';
import { useUndoRedo } from '@/hooks/canvas/useUndoRedo';
import type { Command } from '@/lib/history/CommandHistory';
import type { TextElement, DrawElement } from '@/types';

/** Extract and z-sort TextElements from the element map. */
function useTextElements(elements: Map<string, DrawElement>): TextElement[] {
  return useMemo(() => {
    const texts: TextElement[] = [];
    for (const el of elements.values()) {
      if (el.type === 'text') texts.push(el);
    }
    // Z-order: earlier-created elements render first (painter order)
    return texts.sort((a, b) => a.createdAt - b.createdAt);
  }, [elements]);
}

export default function TextOverlay() {
  const { elements, camera, setElements } = useWhiteboard();
  const textElements = useTextElements(elements);
  const { push } = useUndoRedo();

  const [editingId, setEditingId] = useState<string | null>(null);
  const contentBeforeEdit = useRef<string>('');
  const editableRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const updateElementContent = useCallback(
    (id: string, content: string) => {
      const next = new Map(elements);
      const el = next.get(id);
      if (el?.type !== 'text') return;
      next.set(id, { ...el, content, updatedAt: Date.now() });
      setElements(next);
    },
    [elements, setElements],
  );

  const handleDoubleClick = useCallback(
    (id: string) => {
      const el = elements.get(id);
      if (el?.type !== 'text' || el.locked) return;
      contentBeforeEdit.current = (el).content;
      setEditingId(id);
      // Focus after React commit
      requestAnimationFrame(() => {
        const div = editableRefs.current.get(id);
        if (div) {
          div.focus();
          // Place cursor at end
          const sel = window.getSelection();
          if (sel) {
            sel.selectAllChildren(div);
            sel.collapseToEnd();
          }
        }
      });
    },
    [elements],
  );

  // Stable ref so undo/redo commands always read current elements
  const elementsRef = useRef(elements);
   
  useEffect(() => { 
    elementsRef.current = elements;
  }, [elements]);

  const handleBlur = useCallback(
    (id: string) => {
      const div = editableRefs.current.get(id);
      const newContent = div?.textContent ?? '';
      const oldContent = contentBeforeEdit.current;

      setEditingId(null);

      if (newContent === oldContent) return;

      const applyContent = (content: string) => {
        const current = elementsRef.current;
        const el = current.get(id);
        if (el?.type !== 'text') return;
        const next = new Map(current);
        next.set(id, { ...el, content, updatedAt: Date.now() });
        setElements(next);
      };

      const command: Command = {
        type: 'text-edit',
        execute() {
          applyContent(newContent);
        },
        undo() {
          applyContent(oldContent);
        },
      };
      // push calls execute(), which applies newContent (already shown live)
      push(command);
    },
    [setElements, push],
  );

  const handleInput = useCallback(
    (id: string) => {
      const div = editableRefs.current.get(id);
      if (!div) return;
      updateElementContent(id, div.textContent ?? '');
    },
    [updateElementContent],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>, id: string) => {
      // Escape cancels editing
      if (e.key === 'Escape') {
        const div = editableRefs.current.get(id);
        if (div) {
          div.textContent = contentBeforeEdit.current;
          updateElementContent(id, contentBeforeEdit.current);
        }
        setEditingId(null);
        e.preventDefault();
      }
      // Prevent canvas-level shortcuts while editing
      e.stopPropagation();
    },
    [updateElementContent],
  );

  return (
    <div className="absolute inset-0 z-40 pointer-events-none">
      {textElements.map((el, index) => {
        const isEditing = editingId === el.id;
        const screenX = el.x * camera.zoom + camera.x;
        const screenY = el.y * camera.zoom + camera.y;

        return (
          <div
            key={el.id}
            ref={(node) => {
              if (node) editableRefs.current.set(el.id, node);
              else editableRefs.current.delete(el.id);
            }}
            role="textbox"
            tabIndex={isEditing ? 0 : -1}
            aria-label={el.content || 'Empty text'}
            aria-readonly={!isEditing}
            contentEditable={isEditing}
            suppressContentEditableWarning
            onDoubleClick={() => handleDoubleClick(el.id)}
            onBlur={() => handleBlur(el.id)}
            onInput={() => handleInput(el.id)}
            onKeyDown={(e) => handleKeyDown(e, el.id)}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              transform: `translate(${screenX}px, ${screenY}px) rotate(${el.rotation}rad) scale(${camera.zoom})`,
              transformOrigin: '0 0',
              width: el.w > 0 ? el.w : undefined,
              minWidth: 20,
              minHeight: el.style.fontSize * el.style.lineHeight,
              fontFamily: 'var(--font-caveat), cursive',
              fontSize: el.style.fontSize,
              fontWeight: el.style.fontWeight,
              lineHeight: el.style.lineHeight,
              letterSpacing: el.style.letterSpacing,
              color: el.style.color,
              textAlign: el.style.align,
              opacity: el.opacity,
              zIndex: index,
              pointerEvents: isEditing || !el.locked ? 'auto' : 'none',
              cursor: isEditing ? 'text' : 'default',
              outline: isEditing ? '2px solid #3b82f6' : 'none',
              outlineOffset: 2,
              borderRadius: 2,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              userSelect: isEditing ? 'text' : 'none',
              WebkitUserSelect: isEditing ? 'text' : 'none',
              padding: 2,
            }}
          >
            {el.content}
          </div>
        );
      })}
    </div>
  );
}
