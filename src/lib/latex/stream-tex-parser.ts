import { normalizeTexForMathJax } from './tex-normalize';

export interface ParsedSegment {
  kind: 'text' | 'latex';
  value: string;
  display: boolean;
}

interface Delimiter {
  open: string;
  close: string;
  display: boolean;
  braceBalanced?: boolean;
}

const DELIMITERS: Delimiter[] = [
  { open: '\\begin{equation*}', close: '\\end{equation*}', display: true },
  { open: '\\begin{equation}', close: '\\end{equation}', display: true },
  { open: '\\begin{align*}', close: '\\end{align*}', display: true },
  { open: '\\begin{align}', close: '\\end{align}', display: true },
  { open: '\\begin{gather*}', close: '\\end{gather*}', display: true },
  { open: '\\begin{gather}', close: '\\end{gather}', display: true },
  { open: '\\begin{cases}', close: '\\end{cases}', display: true },
  { open: '\\begin{gathered}', close: '\\end{gathered}', display: true },
  { open: '$$', close: '$$', display: true },
  { open: '\\\\[', close: '\\\\]', display: true },
  { open: '\\[', close: '\\]', display: true },
  { open: '\\\\(', close: '\\\\)', display: false },
  { open: '\\(', close: '\\)', display: false },
  { open: '\\ce{', close: '}', display: false, braceBalanced: true },
  { open: '\\pu{', close: '}', display: false, braceBalanced: true },
  { open: '$', close: '$', display: false },
].sort((a, b) => b.open.length - a.open.length);

const SURROUNDING_CHAR_REGEX =
  /[\s.,;:!?(){}\[\]"'`~\-+/\\=<>|@。。，、；：？！“”‘’（）「」『』［］《》【】‹›«»…⋯]/u;

function isEscapedAt(input: string, index: number): boolean {
  let slashCount = 0;
  for (let i = index - 1; i >= 0 && input[i] === '\\'; i--) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}

function isLikelyMathBoundary(input: string, index: number): boolean {
  if (index <= 0) return true;
  const prev = input[index - 1];
  if (!prev) return true;
  return SURROUNDING_CHAR_REGEX.test(prev);
}

function isRowSpacingCommandAt(input: string, index: number, delimiter: Delimiter): boolean {
  if (delimiter.open !== '\\\\[' && delimiter.open !== '\\[') return false;
  const tail = input.slice(index);

  // Avoid mistaking TeX row spacing commands (e.g. \\[4pt]) as display delimiters.
  return /^\\\\?\[\s*[-+]?\d*\.?\d+\s*(?:pt|em|ex|px|mm|cm|in)\s*\]/.test(tail);
}

function findOpening(input: string, from: number): { index: number; delimiter: Delimiter } | null {
  for (let i = from; i < input.length; i++) {
    for (const delimiter of DELIMITERS) {
      if (!input.startsWith(delimiter.open, i)) continue;
      if (!isLikelyMathBoundary(input, i)) continue;
      if (isRowSpacingCommandAt(input, i, delimiter)) continue;
      if (delimiter.open === '$') {
        if (input.startsWith('$$', i)) continue;
        if (isEscapedAt(input, i)) continue;
      }
      return { index: i, delimiter };
    }
  }
  return null;
}

function findMatchingBrace(input: string, from: number): number {
  let depth = 1;

  for (let i = from; i < input.length; i++) {
    const char = input[i];
    if (!char) continue;
    if (char === '\\') {
      i += 1;
      continue;
    }
    if (char === '{') {
      depth += 1;
      continue;
    }
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }

  return -1;
}

function findClosing(input: string, from: number, delimiter: Delimiter): number {
  if (delimiter.braceBalanced) return findMatchingBrace(input, from);

  if (delimiter.close !== '$') {
    return input.indexOf(delimiter.close, from);
  }

  for (let i = from; i < input.length; i++) {
    if (input[i] !== '$') continue;
    if (isEscapedAt(input, i)) continue;
    return i;
  }

  return -1;
}

function looksLikeImplicitMathLine(rawLine: string): boolean {
  const line = rawLine.trim();
  if (line.length < 3) return false;
  if (line.includes('http://') || line.includes('https://') || line.includes('`')) return false;

  const stripped = line
    .replace(/^[-*+]\s+/, '')
    .replace(/^\d+[\.)]\s+/, '')
    .trim();
  if (!stripped) return false;

  if (/^\\?\[/.test(stripped) && !/\\?\]/.test(stripped)) return false;
  if (/^\\?\(/.test(stripped) && !/\\?\)/.test(stripped)) return false;
  if (stripped.startsWith('$$') && !stripped.endsWith('$$')) return false;
  if (stripped.startsWith('$') && !stripped.endsWith('$')) return false;

  const hasTexCommand = /\\[a-zA-Z]+/.test(stripped);
  const hasScript = /(?<!\\)[\^_](\{[^}]+\}|[A-Za-z0-9])/.test(stripped);
  const hasEquation = /[=<>±]/.test(stripped);
  const hasMathOps = /[+\-*/]/.test(stripped);
  const allowedChars = /^[A-Za-z0-9\s\\{}()[\]^_+\-*/=.,:;|&±√∞∑∫→≤≥]+$/.test(stripped);
  const proseWords = stripped
    .replace(/\\[a-zA-Z]+/g, ' ')
    .replace(/[0-9{}()[\]^_+\-*/=.,:;|±√∞∑∫→≤≥]/g, ' ')
    .match(/[A-Za-z]{3,}/g) ?? [];

  if (!allowedChars) return false;
  if (proseWords.length >= 3) return false;

  if (hasTexCommand) {
    // Avoid promoting prose lines like "with a\neq 0" into full-line math.
    if (!hasEquation && !hasMathOps && !hasScript && proseWords.length > 0) {
      return false;
    }
    return true;
  }

  if (hasScript && !hasEquation && !hasMathOps) return false;
  if (hasScript && (hasEquation || hasMathOps)) return true;
  if (hasEquation && stripped.split(/\s+/).length <= 10) return true;
  return false;
}

function looksLikeInlineMathCandidate(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 2) return false;
  if (!/\\[a-zA-Z]+/.test(trimmed)) return false;

  const proseWords = trimmed
    .replace(/\\[a-zA-Z]+/g, ' ')
    .replace(/[0-9{}()[\]^_+\-*/=.,:;|±√∞∑∫→≤≥]/g, ' ')
    .match(/[A-Za-z]{3,}/g) ?? [];

  return proseWords.length <= 1;
}

function parseScriptOperand(line: string, start: number): number {
  const first = line[start];
  if (!first) return start;
  if (first === '{') {
    let depth = 1;
    let cursor = start + 1;
    while (cursor < line.length) {
      const char = line[cursor];
      if (!char) break;
      if (char === '\\') {
        cursor += 2;
        continue;
      }
      if (char === '{') depth += 1;
      if (char === '}') {
        depth -= 1;
        if (depth === 0) return cursor + 1;
      }
      cursor += 1;
    }
    return start;
  }
  if (/[A-Za-z0-9]/.test(first)) return start + 1;
  return start;
}

function findInlineScriptSpans(line: string): Array<{ start: number; end: number }> {
  const spans: Array<{ start: number; end: number }> = [];

  for (let i = 0; i < line.length; i++) {
    const marker = line[i];
    if (marker !== '^' && marker !== '_') continue;
    if (isEscapedAt(line, i)) continue;

    let left = i - 1;
    while (left >= 0 && /[A-Za-z0-9()[\]{}\\]/.test(line[left] ?? '')) {
      left -= 1;
    }
    const start = left + 1;
    if (start >= i) continue;

    let end = parseScriptOperand(line, i + 1);
    if (end <= i + 1) continue;

    let cursor = end;
    while (cursor < line.length) {
      const nextMarker = line[cursor];
      if ((nextMarker !== '^' && nextMarker !== '_') || isEscapedAt(line, cursor)) break;
      const nextEnd = parseScriptOperand(line, cursor + 1);
      if (nextEnd <= cursor + 1) break;
      end = nextEnd;
      cursor = nextEnd;
    }

    const candidate = line.slice(start, end).trim();
    if (!candidate) continue;
    if (!/(?<!\\)[\^_]/.test(candidate)) continue;

    const prev = spans[spans.length - 1];
    if (prev && start <= prev.end) {
      prev.end = Math.max(prev.end, end);
    } else {
      spans.push({ start, end });
    }

    i = end - 1;
  }

  return spans;
}

function findInlineLatexSpans(line: string): Array<{ start: number; end: number }> {
  const spans: Array<{ start: number; end: number }> = [];
  const commandRegex = /\\[a-zA-Z]+/g;
  let match: RegExpExecArray | null = null;

  while ((match = commandRegex.exec(line)) !== null) {
    const commandStart = match.index;
    let start = commandStart;
    while (start > 0 && /[A-Za-z0-9]/.test(line[start - 1] ?? '')) {
      start -= 1;
    }

    let cursor = commandStart + match[0].length;
    let braceDepth = 0;
    let usedSpaceGap = false;

    while (cursor < line.length) {
      const char = line[cursor]!;

      if (char === '\\') {
        const cmd = line.slice(cursor).match(/^\\[a-zA-Z]+/);
        if (cmd) {
          cursor += cmd[0].length;
          usedSpaceGap = false;
          continue;
        }
        break;
      }

      if (char === '{') {
        braceDepth += 1;
        cursor += 1;
        usedSpaceGap = false;
        continue;
      }

      if (char === '}') {
        if (braceDepth === 0) break;
        braceDepth -= 1;
        cursor += 1;
        usedSpaceGap = false;
        continue;
      }

      if (braceDepth === 0 && /[,:;!?[\])]/.test(char)) break;
      if (braceDepth === 0 && char === '.' && cursor === line.length - 1) break;

      if (char === ' ') {
        let next = cursor;
        while (next < line.length && line[next] === ' ') next += 1;
        const nextSlice = line.slice(next);
        const nextChar = line[next];
        if (
          !nextChar ||
          usedSpaceGap ||
          !/[A-Za-z0-9\\{(+\-*/=<>^_]/.test(nextChar) ||
          /^[A-Za-z]{2,}/.test(nextSlice)
        ) {
          break;
        }
        usedSpaceGap = true;
        cursor = next;
        continue;
      }

      if (/[A-Za-z0-9^_+\-*/=<>|().]/.test(char)) {
        cursor += 1;
        usedSpaceGap = false;
        continue;
      }

      break;
    }

    let end = cursor;
    while (end > start && /\s/.test(line[end - 1] ?? '')) end -= 1;
    if (end <= start) continue;

    const candidate = line.slice(start, end);
    if (!looksLikeInlineMathCandidate(candidate)) continue;

    const prev = spans[spans.length - 1];
    if (prev && start <= prev.end) {
      prev.end = Math.max(prev.end, end);
    } else {
      spans.push({ start, end });
    }

    commandRegex.lastIndex = Math.max(commandRegex.lastIndex, end);
  }

  return spans;
}

function splitInlineLatexFromTextLine(line: string): ParsedSegment[] {
  if (!line) return [];
  const sorted = [...findInlineLatexSpans(line), ...findInlineScriptSpans(line)].sort((a, b) =>
    a.start === b.start ? a.end - b.end : a.start - b.start,
  );
  const spans: Array<{ start: number; end: number }> = [];
  for (const span of sorted) {
    const prev = spans[spans.length - 1];
    if (!prev) {
      spans.push({ ...span });
      continue;
    }
    if (span.start <= prev.end) {
      prev.end = Math.max(prev.end, span.end);
      continue;
    }
    spans.push({ ...span });
  }
  if (spans.length === 0) return [{ kind: 'text', value: line, display: false }];

  const segments: ParsedSegment[] = [];
  let cursor = 0;

  spans.forEach((span) => {
    if (span.start > cursor) {
      segments.push({ kind: 'text', value: line.slice(cursor, span.start), display: false });
    }

    const normalized = normalizeTexForMathJax(line.slice(span.start, span.end));
    if (normalized) {
      segments.push({ kind: 'latex', value: normalized, display: false });
    } else {
      segments.push({ kind: 'text', value: line.slice(span.start, span.end), display: false });
    }
    cursor = span.end;
  });

  if (cursor < line.length) {
    segments.push({ kind: 'text', value: line.slice(cursor), display: false });
  }

  return segments;
}

function splitImplicitMathFromText(text: string): ParsedSegment[] {
  if (!text) return [];

  const segments: ParsedSegment[] = [];
  const lines = text.split('\n');

  lines.forEach((line, index) => {
    const isMath = looksLikeImplicitMathLine(line);
    if (isMath) {
      segments.push({
        kind: 'latex',
        value: normalizeTexForMathJax(line.trim()),
        display: true,
      });
    } else if (line.length > 0) {
      segments.push(...splitInlineLatexFromTextLine(line));
    }

    if (index < lines.length - 1) {
      segments.push({ kind: 'text', value: '\n', display: false });
    }
  });

  return segments.filter((segment) => !(segment.kind === 'latex' && !segment.value));
}

function compactTextSegments(segments: ParsedSegment[]): ParsedSegment[] {
  if (segments.length <= 1) return segments;

  const compacted: ParsedSegment[] = [];
  for (const segment of segments) {
    const prev = compacted[compacted.length - 1];
    if (segment.kind === 'text' && prev?.kind === 'text') {
      prev.value += segment.value;
      continue;
    }
    compacted.push(segment);
  }

  return compacted;
}

export function parseStreamingLatex(content: string): ParsedSegment[] {
  if (!content) return [];

  const segments: ParsedSegment[] = [];
  let cursor = 0;

  while (cursor < content.length) {
    const opening = findOpening(content, cursor);
    if (!opening) {
      segments.push(...splitImplicitMathFromText(content.slice(cursor)));
      break;
    }

    if (opening.index > cursor) {
      segments.push(...splitImplicitMathFromText(content.slice(cursor, opening.index)));
    }

    const bodyStart = opening.index + opening.delimiter.open.length;
    const closeIndex = findClosing(content, bodyStart, opening.delimiter);

    if (closeIndex === -1) {
      segments.push({
        kind: 'text',
        value: content.slice(opening.index),
        display: false,
      });
      break;
    }

    const rawTex = content.slice(bodyStart, closeIndex);
    const normalizedTex = normalizeTexForMathJax(rawTex);

    if (!normalizedTex) {
      segments.push({
        kind: 'text',
        value: content.slice(opening.index, closeIndex + opening.delimiter.close.length),
        display: false,
      });
    } else {
      segments.push({
        kind: 'latex',
        value: normalizedTex,
        display: opening.delimiter.display,
      });
    }

    cursor = closeIndex + opening.delimiter.close.length;
  }

  return compactTextSegments(segments);
}
