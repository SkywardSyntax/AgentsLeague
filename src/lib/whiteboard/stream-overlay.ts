import type { DrawBatch, DrawElement } from '@/types/agent';

const STREAM_OVERLAY_ID_PREFIXES = ['stream-text-', 'stream-latex-'] as const;

/** Returns true if `id` starts with a stream overlay prefix (`stream-text-` or `stream-latex-`). */
export function isStreamOverlayElementId(id: string): boolean {
  return STREAM_OVERLAY_ID_PREFIXES.some((prefix) => id.startsWith(prefix));
}

/** Filter out stream overlay elements from the persisted scene array. */
export function removeStreamOverlayFromScene(scene: DrawElement[]): DrawElement[] {
  return scene.filter((element) => !isStreamOverlayElementId(element.id));
}

/** Filter out stream overlay elements from all batches, dropping empty batches. */
export function removeStreamOverlayFromBatches(batches: DrawBatch[]): DrawBatch[] {
  return batches
    .map((batch) => ({
      ...batch,
      elements: batch.elements.filter((element) => !isStreamOverlayElementId(element.id)),
    }))
    .filter((batch) => batch.elements.length > 0);
}

function normalizeLineForKey(line: string): string {
  return line.replace(/\s+/g, ' ').trim().toLowerCase();
}

function isUsefulStepLine(line: string): boolean {
  if (!line) return false;
  if (/^\d+[\.)]\s+/.test(line)) return true;
  if (/^step\s+\d+/i.test(line)) return true;
  if (/^[-*]\s+/.test(line)) return true;
  if (line.endsWith(':') && line.length <= 96) return true;
  if (/^(start|therefore|thus|hence|final|result)\b/i.test(line)) return true;
  return false;
}

/**
 * Extract useful step lines (numbered items, bullets, headings) from
 * streaming assistant text. Returns at most 8 most recent lines, excluding
 * incomplete (un-newlined) trailing content and LaTeX commands.
 */
export function extractStreamStepLines(content: string): string[] {
  const lines = content.split('\n');
  const completeLines = content.endsWith('\n') ? lines : lines.slice(0, -1);
  return completeLines
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !/\\[a-zA-Z]+/.test(line))
    .filter((line) => isUsefulStepLine(line))
    .slice(-8);
}

/** Normalize and prefix a text line as a dedup key for stream overlay. */
export function toStreamTextKey(line: string): string {
  return `text:${normalizeLineForKey(line)}`;
}

/** Normalize and prefix a TeX string as a dedup key for stream overlay. */
export function toStreamLatexKey(tex: string): string {
  return `latex:${tex.replace(/\s+/g, ' ').trim()}`;
}

