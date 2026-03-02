const MAX_MESSAGE_LENGTH = 20_000;

/**
 * Sanitize and validate user message input.
 * Returns the cleaned message string, or null if invalid.
 */
export function sanitizeUserMessage(rawInput: string): string | null {
  const cleaned = rawInput.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
  if (!cleaned || cleaned.length > MAX_MESSAGE_LENGTH) return null;
  return cleaned;
}
