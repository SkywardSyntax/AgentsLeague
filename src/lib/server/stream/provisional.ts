/** Pure helper functions for provisional streaming — extracted from route.ts. */

export function normalizeChunkKey(kind: 'latex' | 'text', value: string): string {
  return `${kind}:${value.replace(/\s+/g, ' ').trim().toLowerCase()}`;
}

export function extractStableChunks(content: string): Array<{ kind: 'latex' | 'text'; value: string }> {
  const chunks: Array<{ kind: 'latex' | 'text'; value: string }> = [];

  // Extract \[...\] block LaTeX
  const blockRegex = /\\\[((?:.|\n)*?)\\\]/g;
  let blockMatch: RegExpExecArray | null = null;
  while ((blockMatch = blockRegex.exec(content)) !== null) {
    const tex = blockMatch[1]?.trim();
    if (tex) chunks.push({ kind: 'latex', value: tex });
  }

  // Extract $$...$$ display math
  const displayMathRegex = /\$\$((?:.|\n)*?)\$\$/g;
  let displayMatch: RegExpExecArray | null = null;
  while ((displayMatch = displayMathRegex.exec(content)) !== null) {
    const tex = displayMatch[1]?.trim();
    if (tex) chunks.push({ kind: 'latex', value: tex });
  }

  // Stateful line scanner: track fenced code blocks and skip their content
  const lines = content.split('\n');
  const completeLines = content.endsWith('\n') ? lines : lines.slice(0, -1);
  let inFencedBlock = false;
  for (const line of completeLines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('```')) {
      inFencedBlock = !inFencedBlock;
      continue;
    }
    if (inFencedBlock) continue;
    if (!trimmed) continue;
    if (/^(\d+[\.)]\s+|step\s+\d+|[-*]\s+)/i.test(trimmed)) {
      chunks.push({ kind: 'text', value: trimmed });
    }
  }

  return chunks;
}

export function estimateProvisionalAdvance(chunk: { kind: 'latex' | 'text'; value: string }): number {
  if (chunk.kind === 'text') {
    const wrappedLines = Math.max(1, Math.ceil(chunk.value.length / 62));
    return 20 + wrappedLines * 30;
  }
  const tex = chunk.value;
  const fracCount = (tex.match(/\\(?:d?frac|tfrac)\b/g) ?? []).length;
  const rootCount = (tex.match(/\\sqrt\b/g) ?? []).length;
  const matrixLikeCount = (tex.match(/\\(?:begin\{[^}]*matrix\}|begin\{array\}|cases|aligned|align)\b/g) ?? [])
    .length;
  const scriptCount = (tex.match(/[\^_]/g) ?? []).length;
  const lineBreakCount = (tex.match(/\\\\/g) ?? []).length;

  return Math.max(
    88,
    74 +
      fracCount * 22 +
      rootCount * 8 +
      matrixLikeCount * 56 +
      Math.min(24, scriptCount * 2) +
      lineBreakCount * 28,
  );
}
