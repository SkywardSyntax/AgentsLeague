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
    { open: '\\begin{equation}', close: '\\end{equation}', displayMode: true },
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

export function normalizeTexForMathJax(input: string): string {
  let tex = input.replace(/\u00a0/g, ' ').trim();

  const stripped = stripOuterDelimiters(tex);
  tex = stripped.tex;

  // Convert over-escaped commands (e.g. "\\frac") into valid TeX ("\\frac" in JS string).
  tex = tex.replace(/\\\\(?=[A-Za-z])/g, '\\');

  return tex.trim();
}

export function prepareTexForMathJax(input: string, displayMode?: boolean): PreparedTex {
  const stripped = stripOuterDelimiters(input);
  const normalized = normalizeTexForMathJax(stripped.tex);
  const resolvedDisplayMode = displayMode ?? stripped.displayMode ?? false;

  return {
    tex: normalized,
    displayMode: resolvedDisplayMode,
  };
}
