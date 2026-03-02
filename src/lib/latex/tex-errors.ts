const ERROR_PATTERNS: Array<{ pattern: RegExp; format: (match: RegExpMatchArray) => string }> = [
  {
    pattern: /TeX rendering timed out after (\d+)ms/,
    format: (m) => `Rendering timed out (${Math.round(Number(m[1]) / 1000)}s) — expression may be too complex`,
  },
  {
    pattern: /(?:Unknown|Undefined) control sequence\s*(\\[a-zA-Z]+)?/i,
    format: (m) => `Unknown command: ${m[1] ?? '(unknown)'}`,
  },
  { pattern: /Missing close brace/, format: () => "Unmatched '{' in expression" },
  { pattern: /Missing open brace/, format: () => "Unmatched '}' in expression" },
  { pattern: /Extra close brace/, format: () => "Extra '}' found" },
  { pattern: /Extra open brace/, format: () => "Extra '{' found" },
  { pattern: /Missing \\right/i, format: () => 'Unmatched \\left delimiter' },
  { pattern: /Missing \\left/i, format: () => 'Unmatched \\right delimiter' },
  { pattern: /Double superscript/, format: () => 'Double superscript — use {a^b}^c' },
  { pattern: /Double subscript/, format: () => 'Double subscript — use {a_b}_c' },
  { pattern: /Misplaced &/, format: () => "'&' used outside of table/alignment environment" },
  { pattern: /Missing \$ inserted/, format: () => 'Math mode delimiter missing' },
  { pattern: /exceeds maximum length/, format: () => 'Expression too long to render' },
];

export function formatTexError(error: unknown, tex: string): string {
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : '';

  for (const { pattern, format } of ERROR_PATTERNS) {
    const match = message.match(pattern);
    if (match) return format(match);
  }

  const preview = tex.length > 40 ? tex.slice(0, 40) + '…' : tex;
  return message ? `${message} (input: ${preview})` : `Rendering failed for: ${preview}`;
}

export function isTimeoutError(error: unknown): boolean {
  if (error instanceof Error && error.name === 'RenderTimeoutError') return true;
  const msg = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return /timed out/i.test(msg);
}
