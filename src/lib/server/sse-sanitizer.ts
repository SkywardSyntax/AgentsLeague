/**
 * SSE sanitizer — prevent header injection and event name spoofing in SSE streams.
 * Validates and sanitizes all fields before they are written to the stream.
 */

const ALLOWED_EVENT_NAMES = new Set([
  'message',
  'assistant.text.delta',
  'assistant.text.done',
  'assistant.draw.batch',
  'assistant.semantic.batch',
  'assistant.error',
  'assistant.planning.start',
  'assistant.planning.done',
  'ping',
  'heartbeat',
]);

const CRLF_RE = /[\r\n]/g;
const NULL_BYTE_RE = /\0/g;
const EVENT_NAME_RE = /^[a-zA-Z][a-zA-Z0-9._-]*$/;

const MAX_DATA_SIZE = 1_048_576; // 1 MB
const MAX_EVENT_NAME_LENGTH = 64;
const MAX_FIELD_VALUE_LENGTH = 256;

export interface SseValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateEventName(name: string): SseValidationResult {
  const errors: string[] = [];

  if (typeof name !== 'string' || name.length === 0) {
    return { valid: false, errors: ['Event name must be a non-empty string'] };
  }

  if (name.length > MAX_EVENT_NAME_LENGTH) {
    errors.push(`Event name exceeds max length of ${MAX_EVENT_NAME_LENGTH}`);
  }

  if (!EVENT_NAME_RE.test(name)) {
    errors.push('Event name contains invalid characters');
  }

  if (CRLF_RE.test(name)) {
    errors.push('Event name contains CRLF characters (header injection attempt)');
  }

  if (!ALLOWED_EVENT_NAMES.has(name)) {
    errors.push(`Event name "${name}" is not in the allowlist`);
  }

  return { valid: errors.length === 0, errors };
}

export function sanitizeDataField(data: unknown): { value: string; sanitized: boolean } {
  if (typeof data === 'undefined' || data === null) {
    return { value: '', sanitized: false };
  }

  let str: string;
  if (typeof data === 'string') {
    str = data;
  } else {
    try {
      str = JSON.stringify(data);
    } catch {
      return { value: '', sanitized: true };
    }
  }

  let sanitized = false;

  if (NULL_BYTE_RE.test(str)) {
    str = str.replace(NULL_BYTE_RE, '');
    sanitized = true;
  }

  if (str.length > MAX_DATA_SIZE) {
    str = str.slice(0, MAX_DATA_SIZE);
    sanitized = true;
  }

  return { value: str, sanitized };
}

export function sanitizeFieldValue(field: string, value: string): string {
  let result = value;
  result = result.replace(CRLF_RE, ' ');
  result = result.replace(NULL_BYTE_RE, '');
  if (result.length > MAX_FIELD_VALUE_LENGTH) {
    result = result.slice(0, MAX_FIELD_VALUE_LENGTH);
  }
  return result;
}

export function formatSafeSSE(
  event: string,
  data: unknown,
): { output: string; errors: string[] } {
  const errors: string[] = [];

  const eventCheck = validateEventName(event);
  if (!eventCheck.valid) {
    errors.push(...eventCheck.errors);
    return { output: '', errors };
  }

  const dataResult = sanitizeDataField(data);

  // SSE spec: each line of data must be prefixed with "data: "
  const dataLines = dataResult.value.split('\n').map((line) => `data: ${line}`).join('\n');

  const output = `event: ${event}\n${dataLines}\n\n`;
  return { output, errors };
}

export function isAllowedEventName(name: string): boolean {
  return ALLOWED_EVENT_NAMES.has(name);
}

export function detectHeaderInjection(value: string): boolean {
  return CRLF_RE.test(value) || NULL_BYTE_RE.test(value);
}
