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

  it('returns empty array for empty input', () => {
    expect(extractStreamStepLines('')).toEqual([]);
  });

  it('includes lines of exactly 96 chars ending with colon and excludes 97', () => {
    const line96 = 'A'.repeat(95) + ':';
    expect(line96).toHaveLength(96);
    const result96 = extractStreamStepLines(line96 + '\n');
    expect(result96).toEqual([line96]);

    const line97 = 'A'.repeat(96) + ':';
    expect(line97).toHaveLength(97);
    const result97 = extractStreamStepLines(line97 + '\n');
    expect(result97).toEqual([]);
  });

  it('excludes lines containing LaTeX commands', () => {
    const content = '\\frac{a}{b} = c\n';
    expect(extractStreamStepLines(content)).toEqual([]);
  });

  it('includes multi-digit numbered items', () => {
    const content = '10. Step ten\n11) Another step\n';
    const lines = extractStreamStepLines(content);
    expect(lines).toEqual(['10. Step ten', '11) Another step']);
  });

  it('normalizes mixed whitespace in toStreamTextKey', () => {
    expect(toStreamTextKey('\t1)  Start\t\twith  ')).toBe('text:1) start with');
  });

  it('excludes incomplete last line when content does not end with newline', () => {
    const content = '1) First step\n2) Second step\n3) Incomplete';
    const lines = extractStreamStepLines(content);
    expect(lines).toEqual(['1) First step', '2) Second step']);
  });

  it('returns all qualifying lines when there are exactly 8', () => {
    const stepLines = Array.from({ length: 8 }, (_, i) => `${i + 1}) Step ${i + 1}`);
    const content = stepLines.join('\n') + '\n';
    const lines = extractStreamStepLines(content);
    expect(lines).toHaveLength(8);
    expect(lines).toEqual(stepLines.map((l) => l.trim()));
  });

  it('returns only the last 8 qualifying lines when there are more', () => {
    const stepLines = Array.from({ length: 10 }, (_, i) => `${i + 1}) Step ${i + 1}`);
    const content = stepLines.join('\n') + '\n';
    const lines = extractStreamStepLines(content);
    expect(lines).toHaveLength(8);
    expect(lines[0]).toBe('3) Step 3');
    expect(lines[7]).toBe('10) Step 10');
  });

  it('filters out LaTeX-only lines and returns empty for all-LaTeX content', () => {
    const content = '\\frac{a}{b}\n\\sum x\n\\int_0^1 f(x)dx\n';
    const lines = extractStreamStepLines(content);
    expect(lines).toEqual([]);
  });

  it('accepts mixed step types: numbered, bulleted, and keyword lines', () => {
    const content = '1) Numbered step\n- Bulleted item\nTherefore the result holds\n';
    const lines = extractStreamStepLines(content);
    expect(lines).toEqual([
      '1) Numbered step',
      '- Bulleted item',
      'Therefore the result holds',
    ]);
  });

  it('rejects lines with trailing colon exceeding 96 chars', () => {
    const longLine = 'A'.repeat(96) + ':';
    const shortLine = 'Setup:';
    const content = `${longLine}\n${shortLine}\n`;
    const lines = extractStreamStepLines(content);
    expect(lines).toEqual(['Setup:']);
  });

  it('normalizes keys with tabs and mixed whitespace', () => {
    expect(toStreamTextKey(' \tABC  def\t ')).toBe('text:abc def');
    expect(toStreamLatexKey('\t x^2  +  1 \t')).toBe('latex:x^2 + 1');
  });
});

