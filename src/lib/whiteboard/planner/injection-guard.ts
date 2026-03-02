/**
 * Planner injection guard — detect and neutralize prompt injection attempts
 * embedded in semantic block content before it reaches the planner.
 */

const SYSTEM_PROMPT_PATTERNS = [
  /\bsystem\s*:\s*/i,
  /\[system\]/i,
  /<<\s*system\s*>>/i,
  /###\s*system\s*prompt/i,
  /\bignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)/i,
  /\bforget\s+(everything|all|your)\b/i,
  /\byou\s+are\s+now\b/i,
  /\bact\s+as\s+(a\s+)?different\b/i,
  /\bnew\s+instructions?\s*:/i,
  /\boverride\s+(all\s+)?instructions?\b/i,
];

const ROLE_IMPERSONATION_PATTERNS = [
  /\bassistant\s*:\s*/i,
  /\buser\s*:\s*/i,
  /\b(admin|root|superuser)\s*:\s*/i,
  /\[assistant\]/i,
  /\[user\]/i,
  /<\|im_start\|>/i,
  /<\|im_end\|>/i,
  /\bEND_TURN\b/,
  /\bHUMAN_TURN\b/,
  /\bAI_TURN\b/,
];

const DELIMITER_PATTERNS = [
  /={3,}/,
  /-{5,}/,
  /#{3,}\s*\n/,
  /```\s*(system|prompt|instruction)/i,
  /\[INST\]/i,
  /\[\/INST\]/i,
  /<\/?s>/i,
];

const ENCODED_PAYLOAD_PATTERNS = [
  /\\u[0-9a-f]{4}/i,
  /\\x[0-9a-f]{2}/i,
  /&#x?[0-9a-f]+;/i,
  /%[0-9a-f]{2}/i,
];

const MAX_BLOCK_CONTENT_LENGTH = 10_000;

export type InjectionThreat = 'system_override' | 'role_impersonation' | 'delimiter_abuse' | 'encoded_payload';

export interface InjectionCheckResult {
  safe: boolean;
  threats: InjectionThreat[];
  sanitizedContent: string;
}

function testPatterns(input: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(input));
}

export function checkForInjection(content: string): InjectionCheckResult {
  const threats: InjectionThreat[] = [];

  if (typeof content !== 'string' || content.length === 0) {
    return { safe: true, threats: [], sanitizedContent: '' };
  }

  if (testPatterns(content, SYSTEM_PROMPT_PATTERNS)) {
    threats.push('system_override');
  }
  if (testPatterns(content, ROLE_IMPERSONATION_PATTERNS)) {
    threats.push('role_impersonation');
  }
  if (testPatterns(content, DELIMITER_PATTERNS)) {
    threats.push('delimiter_abuse');
  }
  if (testPatterns(content, ENCODED_PAYLOAD_PATTERNS)) {
    threats.push('encoded_payload');
  }

  let sanitized = content;
  if (sanitized.length > MAX_BLOCK_CONTENT_LENGTH) {
    sanitized = sanitized.slice(0, MAX_BLOCK_CONTENT_LENGTH);
  }

  return {
    safe: threats.length === 0,
    threats,
    sanitizedContent: sanitized,
  };
}

export function sanitizeBlockContent(content: string): string {
  if (typeof content !== 'string') return '';

  let result = content;

  // Neutralize role markers by wrapping in brackets
  result = result.replace(/\b(system|assistant|user)\s*:/gi, '[$1]:');

  // Strip delimiters
  result = result.replace(/={3,}/g, '~');
  result = result.replace(/-{5,}/g, '-');

  // Decode encoded payloads to plain text
  result = result.replace(/\\u[0-9a-f]{4}/gi, '?');
  result = result.replace(/\\x[0-9a-f]{2}/gi, '?');
  result = result.replace(/&#x?[0-9a-f]+;/gi, '?');

  // Strip chat template markers
  result = result.replace(/<\|im_start\|>/gi, '');
  result = result.replace(/<\|im_end\|>/gi, '');
  result = result.replace(/\[INST\]/gi, '');
  result = result.replace(/\[\/INST\]/gi, '');

  if (result.length > MAX_BLOCK_CONTENT_LENGTH) {
    result = result.slice(0, MAX_BLOCK_CONTENT_LENGTH);
  }

  return result;
}

export function isSemanticContentSafe(blocks: Array<{ content: string }>): {
  safe: boolean;
  blocksWithThreats: Array<{ index: number; threats: InjectionThreat[] }>;
} {
  const blocksWithThreats: Array<{ index: number; threats: InjectionThreat[] }> = [];

  for (let i = 0; i < blocks.length; i++) {
    const result = checkForInjection(blocks[i]!.content);
    if (!result.safe) {
      blocksWithThreats.push({ index: i, threats: result.threats });
    }
  }

  return {
    safe: blocksWithThreats.length === 0,
    blocksWithThreats,
  };
}
