function stripRedundantBraces(tex: string): string {
  // Strip single-char groups: {x} → x
  // But NOT when preceded by } (argument group) or a command like \frac
  let result = tex;
  let prev = '';
  while (result !== prev) {
    prev = result;
    result = result.replace(/(?<!\\[a-zA-Z]*)(?<![}])\{([^{}])\}(?!\{)/g, '$1');
  }
  return result;
}

function normalizeWhitespace(tex: string): string {
  return tex.replace(/\s+/g, ' ').trim();
}

function normalizeCommandSpacing(tex: string): string {
  // Remove spaces between commands and their brace groups: \frac {a} → \frac{a}
  let result = tex.replace(/(\\[a-zA-Z]+)\s+\{/g, '$1{');
  // Remove spaces between consecutive argument groups: }{  b} → }{b}
  result = result.replace(/\}\s+\{/g, '}{');
  // Remove spaces inside brace groups: { a } → {a}
  result = result.replace(/\{\s+/g, '{').replace(/\s+\}/g, '}');
  return result;
}

export function computeTexCacheKey(tex: string, displayMode = false): string {
  let normalized = normalizeWhitespace(tex);
  normalized = normalizeCommandSpacing(normalized);
  normalized = stripRedundantBraces(normalized);
  normalized = normalized.trim();

  const modePrefix = displayMode ? 'D:' : 'I:';
  const raw = modePrefix + normalized;

  // Simple hash to keep key bounded
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw.charCodeAt(i);
    hash = ((hash << 5) - hash + ch) | 0;
  }

  const hashHex = (hash >>> 0).toString(16).padStart(8, '0');
  // Include a truncated version of normalized text for debuggability
  const preview = normalized.slice(0, 48).replace(/[^a-zA-Z0-9_\\{}^]/g, '_');
  return `${hashHex}_${preview}`;
}
