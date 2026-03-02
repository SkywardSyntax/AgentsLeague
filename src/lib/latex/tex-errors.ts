const ERROR_PATTERNS: Array<{ pattern: RegExp; format: (match: RegExpMatchArray) => string }> = [
  {
    pattern: /Unknown control sequence\s*(\\[a-zA-Z]+)?/,
    format: (m) => `Unknown command: ${m[1] ?? '(unknown)'}`,
  },
  { pattern: /Missing close brace/, format: () => "Unmatched '{' in expression" },
  { pattern: /Missing open brace/, format: () => "Unmatched '}' in expression" },
  { pattern: /Extra close brace/, format: () => "Extra '}' found" },
  { pattern: /Double superscript/, format: () => 'Double superscript — use {a^b}^c' },
  { pattern: /Double subscript/, format: () => 'Double subscript — use {a_b}_c' },
  { pattern: /Misplaced &/, format: () => "'&' used outside of table/alignment environment" },
  { pattern: /Missing \$ inserted/, format: () => 'Math mode delimiter missing' },
];

export function formatTexError(error: unknown, _tex: string): string {
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : '';

  for (const { pattern, format } of ERROR_PATTERNS) {
    const match = message.match(pattern);
    if (match) return format(match);
  }

  return message || 'Rendering failed';
}
