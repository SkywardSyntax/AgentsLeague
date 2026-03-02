export type InlineToken =
  | { kind: 'text'; value: string }
  | { kind: 'bold'; value: string }
  | { kind: 'italic'; value: string }
  | { kind: 'strikethrough'; value: string }
  | { kind: 'inline_code'; value: string }
  | { kind: 'link'; text: string; href: string };

const SAFE_PROTOCOLS = /^(?:https?:|mailto:)/i;

/** Only allow safe protocols — blocks javascript:, data:, vbscript: etc. */
export function sanitizeHref(href: string): string {
  const trimmed = href.trim();
  if (SAFE_PROTOCOLS.test(trimmed)) return trimmed;
  // Relative paths are fine (no protocol)
  if (!trimmed.includes(':')) return trimmed;
  return '';
}

export function parseInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let i = 0;
  let buf = '';

  function flush() {
    if (buf) {
      tokens.push({ kind: 'text', value: buf });
      buf = '';
    }
  }

  while (i < text.length) {
    // --- Inline code ---
    if (text[i] === '`') {
      const start = i;
      i++;
      let code = '';
      while (i < text.length && text[i] !== '`') {
        code += text[i];
        i++;
      }
      if (i < text.length) {
        // found closing backtick
        flush();
        tokens.push({ kind: 'inline_code', value: code });
        i++; // skip closing backtick
        continue;
      }
      // No closing backtick — treat as text
      buf += text.slice(start, i);
      continue;
    }

    // --- Link: [text](url) ---
    if (text[i] === '[') {
      const bracketStart = i;
      i++;
      let linkText = '';
      let depth = 1;
      while (i < text.length && depth > 0) {
        if (text[i] === '[') depth++;
        else if (text[i] === ']') depth--;
        if (depth > 0) linkText += text[i];
        i++;
      }
      if (depth === 0 && i < text.length && text[i] === '(') {
        i++; // skip (
        let href = '';
        let pDepth = 1;
        while (i < text.length && pDepth > 0) {
          if (text[i] === '(') pDepth++;
          else if (text[i] === ')') pDepth--;
          if (pDepth > 0) href += text[i];
          i++;
        }
        if (pDepth === 0) {
          const safeHref = sanitizeHref(href);
          if (safeHref) {
            flush();
            tokens.push({ kind: 'link', text: linkText, href: safeHref });
          } else {
            // Unsafe link — render as plain text
            buf += linkText;
          }
          continue;
        }
      }
      // Not a valid link — backtrack
      buf += text.slice(bracketStart, i);
      continue;
    }

    // --- Strikethrough: ~~...~~ ---
    if (text[i] === '~' && text[i + 1] === '~') {
      const closeIdx = text.indexOf('~~', i + 2);
      if (closeIdx !== -1) {
        flush();
        tokens.push({ kind: 'strikethrough', value: text.slice(i + 2, closeIdx) });
        i = closeIdx + 2;
        continue;
      }
    }

    // --- Bold italic: ***...*** or ___...___ ---
    if (
      (text[i] === '*' && text[i + 1] === '*' && text[i + 2] === '*') ||
      (text[i] === '_' && text[i + 1] === '_' && text[i + 2] === '_')
    ) {
      const marker = text.slice(i, i + 3);
      const closeIdx = text.indexOf(marker, i + 3);
      if (closeIdx !== -1) {
        flush();
        const inner = text.slice(i + 3, closeIdx);
        tokens.push({ kind: 'bold', value: inner });
        tokens.push({ kind: 'italic', value: inner });
        i = closeIdx + 3;
        continue;
      }
    }

    // --- Bold: **...**  or __...__ ---
    if (
      (text[i] === '*' && text[i + 1] === '*') ||
      (text[i] === '_' && text[i + 1] === '_')
    ) {
      const marker = text.slice(i, i + 2);
      const closeIdx = text.indexOf(marker, i + 2);
      if (closeIdx !== -1) {
        flush();
        tokens.push({ kind: 'bold', value: text.slice(i + 2, closeIdx) });
        i = closeIdx + 2;
        continue;
      }
    }

    // --- Italic: *...* or _..._ (single) ---
    if (text[i] === '*' && text[i + 1] !== '*') {
      const closeIdx = text.indexOf('*', i + 1);
      if (closeIdx !== -1 && closeIdx > i + 1) {
        flush();
        tokens.push({ kind: 'italic', value: text.slice(i + 1, closeIdx) });
        i = closeIdx + 1;
        continue;
      }
    }

    // Underscore italic: require word boundaries to avoid matching snake_case
    if (text[i] === '_' && text[i + 1] !== '_') {
      const prevChar = i > 0 ? text[i - 1] : undefined;
      const isWordBoundaryBefore = prevChar === undefined || /\s|^$/.test(prevChar);
      if (isWordBoundaryBefore) {
        const closeIdx = text.indexOf('_', i + 1);
        if (closeIdx !== -1 && closeIdx > i + 1) {
          const afterClose = closeIdx + 1 < text.length ? text[closeIdx + 1] : undefined;
          const isWordBoundaryAfter = afterClose === undefined || /\s/.test(afterClose);
          if (isWordBoundaryAfter) {
            flush();
            tokens.push({ kind: 'italic', value: text.slice(i + 1, closeIdx) });
            i = closeIdx + 1;
            continue;
          }
        }
      }
    }

    buf += text[i];
    i++;
  }

  flush();
  return tokens;
}
