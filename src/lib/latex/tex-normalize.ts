/** TeX string with resolved display mode, ready for MathJax rendering. */
export interface PreparedTex {
  tex: string;
  displayMode: boolean;
}

interface DelimiterStripResult {
  tex: string;
  displayMode: boolean | null;
}

function stripOuterDelimiters(input: string): DelimiterStripResult {
  const trimmed = input.trim();

  const candidates: Array<{ open: string; close: string; displayMode: boolean }> = [
    { open: '\\begin{equation*}', close: '\\end{equation*}', displayMode: true },
    { open: '\\begin{equation}', close: '\\end{equation}', displayMode: true },
    { open: '\\begin{align*}', close: '\\end{align*}', displayMode: true },
    { open: '\\begin{align}', close: '\\end{align}', displayMode: true },
    { open: '\\begin{gather*}', close: '\\end{gather*}', displayMode: true },
    { open: '\\begin{gather}', close: '\\end{gather}', displayMode: true },
    { open: '\\begin{cases}', close: '\\end{cases}', displayMode: true },
    { open: '\\begin{gathered}', close: '\\end{gathered}', displayMode: true },
    { open: '\\begin{bmatrix}', close: '\\end{bmatrix}', displayMode: true },
    { open: '\\begin{vmatrix}', close: '\\end{vmatrix}', displayMode: true },
    { open: '\\begin{Bmatrix}', close: '\\end{Bmatrix}', displayMode: true },
    { open: '\\begin{Vmatrix}', close: '\\end{Vmatrix}', displayMode: true },
    { open: '\\begin{pmatrix}', close: '\\end{pmatrix}', displayMode: true },
    { open: '\\begin{split}', close: '\\end{split}', displayMode: true },
    { open: '\\begin{multline*}', close: '\\end{multline*}', displayMode: true },
    { open: '\\begin{multline}', close: '\\end{multline}', displayMode: true },
    { open: '$$', close: '$$', displayMode: true },
    { open: '\\\\[', close: '\\\\]', displayMode: true },
    { open: '\\[', close: '\\]', displayMode: true },
    { open: '\\\\(', close: '\\\\)', displayMode: false },
    { open: '\\(', close: '\\)', displayMode: false },
    { open: '$', close: '$', displayMode: false },
  ];

  for (const candidate of candidates) {
    if (
      trimmed.startsWith(candidate.open) &&
      trimmed.endsWith(candidate.close) &&
      trimmed.length > candidate.open.length + candidate.close.length
    ) {
      return {
        tex: trimmed.slice(candidate.open.length, trimmed.length - candidate.close.length).trim(),
        displayMode: candidate.displayMode,
      };
    }
  }

  return { tex: trimmed, displayMode: null };
}

/**
 * Strip surrounding delimiters (`$`, `$$`, `\[`, `\(`, etc.) and fix
 * over-escaped backslashes (`\\frac` → `\frac`). Returns plain TeX
 * suitable for MathJax's `convert()`.
 */
export function normalizeTexForMathJax(input: string): string {
  let tex = input.replace(/\u00a0/g, ' ').trim();

  const stripped = stripOuterDelimiters(tex);
  tex = stripped.tex;

  // Fix over-escaped commands while preserving row breaks inside environments.
  // Protect \\begin{...}...\\end{...} blocks so row-break \\\\ sequences aren't corrupted.
  const envParts: string[] = [];
  const envPattern = /\\begin\{[^}]+\}[\s\S]*?\\end\{[^}]+\}/g;
  let envMatch: RegExpExecArray | null;
  let lastEnd = 0;
  while ((envMatch = envPattern.exec(tex)) !== null) {
    if (envMatch.index > lastEnd) {
      envParts.push(tex.slice(lastEnd, envMatch.index).replace(/\\\\(?=[A-Za-z])/g, '\\'));
    }
    envParts.push(envMatch[0]);
    lastEnd = envMatch.index + envMatch[0].length;
  }
  if (lastEnd < tex.length) {
    envParts.push(tex.slice(lastEnd).replace(/\\\\(?=[A-Za-z])/g, '\\'));
  }
  tex = envParts.join('');

  // Balance unbalanced \left / \right pairs.
  // Use negative lookahead to avoid matching \leftarrow, \leftrightarrow, etc.
  const leftCount = (tex.match(/\\left(?![a-zA-Z])/g) ?? []).length;
  const rightCount = (tex.match(/\\right(?![a-zA-Z])/g) ?? []).length;
  if (leftCount > rightCount) {
    tex = tex + '\\right.'.repeat(leftCount - rightCount);
  } else if (rightCount > leftCount) {
    tex = '\\left.'.repeat(rightCount - leftCount) + tex;
  }

  return tex.trim();
}

/**
 * Full preparation pipeline: strip delimiters, normalize escaping, and
 * resolve display mode. If `displayMode` is provided it takes precedence
 * over the delimiter-inferred mode.
 */
export function prepareTexForMathJax(input: string, displayMode?: boolean): PreparedTex {
  const stripped = stripOuterDelimiters(input);
  const normalized = normalizeTexForMathJax(stripped.tex);
  const resolvedDisplayMode = displayMode ?? stripped.displayMode ?? false;

  return {
    tex: normalized,
    displayMode: resolvedDisplayMode,
  };
}
