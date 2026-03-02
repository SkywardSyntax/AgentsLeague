export type BlockSegment =
  | { kind: 'paragraph'; content: string }
  | { kind: 'code_block'; content: string; language: string }
  | { kind: 'heading'; content: string; level: 1 | 2 | 3 | 4 | 5 | 6 }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'blockquote'; content: string; children?: BlockSegment[] }
  | { kind: 'table'; headers: string[]; rows: string[][] }
  | { kind: 'hr' };

const MAX_BLOCKQUOTE_DEPTH = 5;
export const MAX_LINE_LENGTH = 10_000;

const CODE_FENCE_OPEN = /^(`{3,}|~{3,})(.*)$/;
const HEADING_RE = /^(#{1,6})\s+(.+)$/;
const HR_RE = /^(?:-{3,}|\*{3,}|_{3,})$/;
const UL_RE = /^[-*+]\s+(.*)$/;
const OL_RE = /^\d+[.)]\s+(.*)$/;
const BQ_RE = /^>\s?(.*)$/;
const TABLE_ROW_RE = /^\|(.+)\|$/;
const TABLE_SEP_RE = /^\|[\s:|-]+\|$/;

/** Parse a table row into trimmed cells, handling escaped pipes. */
function parseTableCells(row: string): string[] {
  // Remove leading/trailing pipes
  const inner = row.slice(1, -1);
  const cells: string[] = [];
  let cell = '';
  let inCode = false;
  for (let j = 0; j < inner.length; j++) {
    const ch = inner[j]!;
    if (ch === '`') {
      inCode = !inCode;
      cell += ch;
    } else if (ch === '\\' && j + 1 < inner.length && inner[j + 1] === '|') {
      cell += '|';
      j++;
    } else if (ch === '|' && !inCode) {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += ch;
    }
  }
  cells.push(cell.trim());
  return cells;
}

function isTableStart(lines: string[], idx: number): boolean {
  if (idx + 1 >= lines.length) return false;
  const row = lines[idx]!;
  const sep = lines[idx + 1]!;
  return TABLE_ROW_RE.test(row) && TABLE_SEP_RE.test(sep);
}

export function parseBlocks(raw: string, depth = 0): BlockSegment[] {
  const lines = raw.split('\n');
  const blocks: BlockSegment[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    // --- Long line guard: treat as plain text to prevent pathological parsing ---
    if (line.length > MAX_LINE_LENGTH) {
      const longLines: string[] = [line];
      i++;
      while (i < lines.length) {
        const pl = lines[i]!;
        if (pl.trim() === '' || pl.length <= MAX_LINE_LENGTH) break;
        longLines.push(pl);
        i++;
      }
      blocks.push({ kind: 'paragraph', content: longLines.join('\n') });
      continue;
    }

    // --- Fenced code block ---
    const fenceMatch = line.match(CODE_FENCE_OPEN);
    if (fenceMatch) {
      const fenceChar = fenceMatch[1]![0]!;
      const fenceLen = fenceMatch[1]!.length;
      const language = fenceMatch[2]!.trim();
      const codeLines: string[] = [];
      i++;
      let closed = false;
      while (i < lines.length) {
        const cl = lines[i]!;
        // Closing fence: same char, at least same length, nothing else meaningful
        const closeRe = new RegExp(`^${fenceChar === '`' ? '`' : '~'}{${fenceLen},}\\s*$`);
        if (closeRe.test(cl)) {
          closed = true;
          i++;
          break;
        }
        codeLines.push(cl);
        i++;
      }
      // If unclosed during streaming, treat as code block (safe fallback)
      blocks.push({ kind: 'code_block', content: codeLines.join('\n'), language });
      if (!closed) break; // nothing after an unclosed fence
      continue;
    }

    // --- Heading ---
    const headingMatch = line.match(HEADING_RE);
    if (headingMatch) {
      const level = headingMatch[1]!.length as 1 | 2 | 3 | 4 | 5 | 6;
      blocks.push({ kind: 'heading', content: headingMatch[2]!, level });
      i++;
      continue;
    }

    // --- Horizontal rule ---
    if (HR_RE.test(line.trim()) && line.trim().length >= 3) {
      blocks.push({ kind: 'hr' });
      i++;
      continue;
    }

    // --- Blockquote ---
    const bqMatch = line.match(BQ_RE);
    if (bqMatch) {
      const bqLines: string[] = [bqMatch[1]!];
      i++;
      while (i < lines.length) {
        const bm = lines[i]!.match(BQ_RE);
        if (!bm) break;
        bqLines.push(bm[1]!);
        i++;
      }
      const content = bqLines.join('\n');
      const children = depth < MAX_BLOCKQUOTE_DEPTH ? parseBlocks(content, depth + 1) : undefined;
      blocks.push({ kind: 'blockquote', content, children });
      continue;
    }

    // --- Table ---
    if (isTableStart(lines, i)) {
      const headers = parseTableCells(lines[i]!);
      i += 2; // skip header + separator rows
      const rows: string[][] = [];
      while (i < lines.length && TABLE_ROW_RE.test(lines[i]!)) {
        rows.push(parseTableCells(lines[i]!));
        i++;
      }
      blocks.push({ kind: 'table', headers, rows });
      continue;
    }

    // --- Unordered list ---
    const ulMatch = line.match(UL_RE);
    if (ulMatch) {
      const items: string[] = [ulMatch[1]!];
      i++;
      while (i < lines.length) {
        const um = lines[i]!.match(UL_RE);
        if (!um) break;
        items.push(um[1]!);
        i++;
      }
      blocks.push({ kind: 'list', ordered: false, items });
      continue;
    }

    // --- Ordered list ---
    const olMatch = line.match(OL_RE);
    if (olMatch) {
      const items: string[] = [olMatch[1]!];
      i++;
      while (i < lines.length) {
        const om = lines[i]!.match(OL_RE);
        if (!om) break;
        items.push(om[1]!);
        i++;
      }
      blocks.push({ kind: 'list', ordered: true, items });
      continue;
    }

    // --- Empty line (skip) ---
    if (line.trim() === '') {
      i++;
      continue;
    }

    // --- Paragraph (collect consecutive non-special lines) ---
    const paraLines: string[] = [line];
    i++;
    while (i < lines.length) {
      const pl = lines[i]!;
      if (
        pl.trim() === '' ||
        CODE_FENCE_OPEN.test(pl) ||
        HEADING_RE.test(pl) ||
        HR_RE.test(pl.trim()) ||
        BQ_RE.test(pl) ||
        isTableStart(lines, i) ||
        UL_RE.test(pl) ||
        OL_RE.test(pl)
      ) {
        break;
      }
      paraLines.push(pl);
      i++;
    }
    blocks.push({ kind: 'paragraph', content: paraLines.join('\n') });
  }

  return blocks;
}
