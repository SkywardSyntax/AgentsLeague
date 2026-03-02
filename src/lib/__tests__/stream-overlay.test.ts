import { describe, expect, it } from 'vitest';
import {
  extractStreamStepLines,
  isStreamOverlayElementId,
  removeStreamOverlayFromBatches,
  removeStreamOverlayFromScene,
  toStreamLatexKey,
  toStreamTextKey,
} from '@/lib/whiteboard/stream-overlay';
import type { DrawBatch, DrawElement } from '@/types/agent';

describe('stream overlay utils', () => {
  it('identifies stream overlay element ids', () => {
    expect(isStreamOverlayElementId('stream-text-1')).toBe(true);
    expect(isStreamOverlayElementId('stream-latex-2')).toBe(true);
    expect(isStreamOverlayElementId('eq-2')).toBe(false);
  });

  it('removes stream overlay elements from scene and batches', () => {
    const scene: DrawElement[] = [
      { id: 'stream-text-1', type: 'text', x: 10, y: 10, text: 'step' },
      { id: 'eq-1', type: 'latex', x: 20, y: 20, tex: 'x=1' },
    ];
    const cleaned = removeStreamOverlayFromScene(scene);
    expect(cleaned).toHaveLength(1);
    expect(cleaned[0]!.id).toBe('eq-1');

    const batches: DrawBatch[] = [
      {
        batch_id: 'b1',
        elements: [
          { id: 'stream-text-1', type: 'text', x: 10, y: 10, text: 'step' },
          { id: 'eq-1', type: 'latex', x: 20, y: 20, tex: 'x=1' },
        ],
      },
      {
        batch_id: 'b2',
        elements: [{ id: 'stream-latex-2', type: 'latex', x: 40, y: 40, tex: 'y=2' }],
      },
    ];
    const cleanedBatches = removeStreamOverlayFromBatches(batches);
    expect(cleanedBatches).toHaveLength(1);
    expect(cleanedBatches[0]!.elements).toHaveLength(1);
    expect(cleanedBatches[0]!.elements[0]!.id).toBe('eq-1');
  });

  it('extracts only useful confirmed step lines from streaming text', () => {
    const content = [
      'Cubic formula (Cardano) key derivation',
      '1) Start with depressed cubic:',
      'x^3+px+q=0',
      'some long paragraph not for board',
      '2) Solve for u and v:',
      '',
    ].join('\n');
    const lines = extractStreamStepLines(content);
    expect(lines).toEqual(['1) Start with depressed cubic:', '2) Solve for u and v:']);
  });

  it('normalizes keys for dedupe', () => {
    expect(toStreamTextKey(' 1)  Start with  ')).toBe('text:1) start with');
    expect(toStreamLatexKey(' x^2 + 1 ')).toBe('latex:x^2 + 1');
  });
});

