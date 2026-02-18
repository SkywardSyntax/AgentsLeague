/**
 * ContextManager — maintains a sliding conversation window under the
 * token budget, summarises old turns, and injects canvas state each turn.
 */

import type { DrawElement } from '@/types';

// ── Token estimation ────────────────────────────────────────────────

const AVG_CHARS_PER_TOKEN = 4;

/** Approximate token count (≈ tiktoken cl100k). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / AVG_CHARS_PER_TOKEN);
}

// ── Types ───────────────────────────────────────────────────────────

export interface ConversationTurn {
  readonly role: 'user' | 'assistant' | 'system' | 'tool';
  readonly content: string;
  readonly tokens?: number;
}

export interface CanvasSummary {
  readonly elementCount: number;
  readonly types: Record<string, number>;
  readonly boundingArea: { x: number; y: number; w: number; h: number } | null;
}

// ── Constants ───────────────────────────────────────────────────────

const MAX_WINDOW_TOKENS = 16_000;
const COMPACTION_THRESHOLD = 12_000;

// ── Context manager ─────────────────────────────────────────────────

export class ContextManager {
  private turns: ConversationTurn[] = [];
  private totalTokens = 0;
  private readonly maxTokens: number;
  private readonly compactionThreshold: number;

  constructor(
    maxTokens: number = MAX_WINDOW_TOKENS,
    compactionThreshold: number = COMPACTION_THRESHOLD,
  ) {
    this.maxTokens = maxTokens;
    this.compactionThreshold = compactionThreshold;
  }

  // ── Public API ──────────────────────────────────────────────────

  getTurns(): readonly ConversationTurn[] {
    return this.turns;
  }

  getTotalTokens(): number {
    return this.totalTokens;
  }

  /** Add a turn, compacting if over threshold. */
  addTurn(turn: ConversationTurn): void {
    const tokens = turn.tokens ?? estimateTokens(turn.content);
    this.turns.push({ ...turn, tokens });
    this.totalTokens += tokens;

    if (this.totalTokens > this.compactionThreshold) {
      this.compact();
    }
  }

  /** Inject a canvas state summary as a system turn. */
  injectCanvasState(elements: readonly DrawElement[]): void {
    const summary = ContextManager.buildCanvasSummary(elements);
    const content = `[Canvas: ${summary.elementCount} elements` +
      (summary.boundingArea
        ? ` in (${summary.boundingArea.x},${summary.boundingArea.y})→(${summary.boundingArea.x + summary.boundingArea.w},${summary.boundingArea.y + summary.boundingArea.h})`
        : '') +
      `. Types: ${JSON.stringify(summary.types)}]`;
    this.addTurn({ role: 'system', content });
  }

  /** Replace N old tool calls with a 1-line summary. */
  compactToolCalls(startIdx: number, endIdx: number, summary: string): void {
    if (startIdx < 0 || endIdx > this.turns.length || startIdx >= endIdx) return;
    const removed = this.turns.splice(startIdx, endIdx - startIdx, {
      role: 'system',
      content: `[Compacted ${endIdx - startIdx} tool calls: ${summary}]`,
      tokens: estimateTokens(summary) + 10,
    });
    const removedTokens = removed.reduce((s, t) => s + (t.tokens ?? 0), 0);
    const addedTokens = this.turns[startIdx]!.tokens ?? 0;
    this.totalTokens += addedTokens - removedTokens;
  }

  reset(): void {
    this.turns = [];
    this.totalTokens = 0;
  }

  // ── Private ─────────────────────────────────────────────────────

  /** Summarise oldest turns to stay under maxTokens. */
  private compact(): void {
    while (this.totalTokens > this.maxTokens && this.turns.length > 2) {
      const oldest = this.turns.shift();
      if (oldest) {
        this.totalTokens -= oldest.tokens ?? 0;
      }
    }

    // If still over threshold after trimming, summarise first half
    if (this.totalTokens > this.compactionThreshold && this.turns.length > 4) {
      const half = Math.floor(this.turns.length / 2);
      const toSummarise = this.turns.slice(0, half);
      const summaryContent = toSummarise
        .map((t) => `${t.role}: ${t.content.slice(0, 60)}`)
        .join(' | ');
      const summary = `[Summary of ${half} turns: ${summaryContent}]`;
      this.compactToolCalls(0, half, summary);
    }
  }

  // ── Static helpers ──────────────────────────────────────────────

  static buildCanvasSummary(elements: readonly DrawElement[]): CanvasSummary {
    const types: Record<string, number> = {};
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (const el of elements) {
      types[el.type] = (types[el.type] ?? 0) + 1;
      if (el.x < minX) minX = el.x;
      if (el.y < minY) minY = el.y;
      const ex = 'w' in el ? el.x + (el as { w: number }).w : el.x;
      const ey = 'h' in el ? el.y + (el as { h: number }).h : el.y;
      if (ex > maxX) maxX = ex;
      if (ey > maxY) maxY = ey;
    }

    return {
      elementCount: elements.length,
      types,
      boundingArea: elements.length > 0
        ? { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
        : null,
    };
  }
}
