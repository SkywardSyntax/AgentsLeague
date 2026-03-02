const MAX_MESSAGE_LENGTH = 20_000;

// Control characters to strip: U+0000–U+0008, U+000B, U+000C, U+000E–U+001F
// Preserves \t (U+0009), \n (U+000A), \r (U+000D)
const CONTROL_CHARS_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F]/g;

/**
 * Replace lone surrogates (U+D800–U+DFFF) with U+FFFD.
 * Uses code-point iteration to avoid breaking valid surrogate pairs.
 */
function replaceLoneSurrogates(s: string): string {
  let result = '';
  for (const cp of s) {
    const code = cp.codePointAt(0)!;
    if (code >= 0xD800 && code <= 0xDFFF) {
      result += '\uFFFD';
    } else {
      result += cp;
    }
  }
  return result;
}

/**
 * Sanitize and validate user message input.
 * Returns the cleaned message string, or null if invalid.
 */
export function sanitizeUserMessage(rawInput: string): string | null {
  let cleaned = rawInput.replace(/[\u200B-\u200D\uFEFF]/g, '');
  cleaned = cleaned.replace(CONTROL_CHARS_RE, '');
  cleaned = replaceLoneSurrogates(cleaned);
  cleaned = cleaned.trim();
  if (!cleaned || cleaned.length > MAX_MESSAGE_LENGTH) return null;
  return cleaned;
}
