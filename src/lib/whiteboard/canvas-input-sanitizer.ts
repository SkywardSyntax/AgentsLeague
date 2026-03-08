/**
 * Canvas input sanitizer — sanitize all user input (paste events, file drops,
 * clipboard data) before processing by the canvas subsystem.
 */

const MAX_PASTE_LENGTH = 50_000;
const MAX_FILENAME_LENGTH = 255;

const DANGEROUS_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.com', '.msi', '.scr', '.pif', '.vbs',
  '.js', '.jse', '.ws', '.wsf', '.wsc', '.wsh', '.ps1', '.ps2',
  '.reg', '.inf', '.lnk', '.hta', '.cpl', '.msp', '.mst',
]);

const ALLOWED_IMAGE_MIMES = new Set([
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp',
]);

const ALLOWED_DROP_MIMES = new Set([
  ...ALLOWED_IMAGE_MIMES,
  'text/plain', 'text/uri-list', 'application/json',
]);

const HTML_TAG_RE = /<\/?[a-z][^>]*>/gi;
const NULL_BYTE_RE = /\0/g;
const CONTROL_CHAR_RE = /[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

export interface SanitizeResult<T = string> {
  value: T;
  sanitized: boolean;
  warnings: string[];
}

export function sanitizePasteText(raw: unknown): SanitizeResult<string> {
  const warnings: string[] = [];
  let sanitized = false;

  if (typeof raw !== 'string') {
    return { value: '', sanitized: true, warnings: ['Input was not a string'] };
  }

  let value = raw;
  let prev: string;

  // Avoid .test() + .replace() on the same /g regex — .test() advances lastIndex,
  // causing .replace() to miss matches. Instead, just .replace() and compare.
  prev = value;
  value = value.replace(NULL_BYTE_RE, '');
  if (value !== prev) {
    sanitized = true;
    warnings.push('Null bytes removed');
  }

  prev = value;
  value = value.replace(CONTROL_CHAR_RE, '');
  if (value !== prev) {
    sanitized = true;
    warnings.push('Control characters removed');
  }

  prev = value;
  value = value.replace(HTML_TAG_RE, '');
  if (value !== prev) {
    sanitized = true;
    warnings.push('HTML tags stripped');
  }

  if (value.length > MAX_PASTE_LENGTH) {
    value = value.slice(0, MAX_PASTE_LENGTH);
    sanitized = true;
    warnings.push(`Truncated to ${MAX_PASTE_LENGTH} characters`);
  }

  return { value, sanitized, warnings };
}

export function validateFileDrop(
  fileName: string,
  mimeType: string,
  fileSize: number,
  maxSizeBytes = 10 * 1024 * 1024,
): SanitizeResult<{ fileName: string; mimeType: string }> {
  const warnings: string[] = [];
  let sanitized = false;

  let safeName = fileName.replace(NULL_BYTE_RE, '').replace(CONTROL_CHAR_RE, '');
  if (safeName !== fileName) {
    sanitized = true;
    warnings.push('Dangerous characters removed from filename');
  }

  if (safeName.length > MAX_FILENAME_LENGTH) {
    safeName = safeName.slice(0, MAX_FILENAME_LENGTH);
    sanitized = true;
    warnings.push('Filename truncated');
  }

  const ext = safeName.includes('.') ? safeName.slice(safeName.lastIndexOf('.')).toLowerCase() : '';
  if (DANGEROUS_EXTENSIONS.has(ext)) {
    return {
      value: { fileName: '', mimeType: '' },
      sanitized: true,
      warnings: [`Blocked dangerous file extension: ${ext}`],
    };
  }

  const normalizedMime = mimeType.toLowerCase().trim();
  if (!ALLOWED_DROP_MIMES.has(normalizedMime)) {
    return {
      value: { fileName: '', mimeType: '' },
      sanitized: true,
      warnings: [`Disallowed MIME type: ${normalizedMime}`],
    };
  }

  if (!Number.isFinite(fileSize) || fileSize < 0 || fileSize > maxSizeBytes) {
    return {
      value: { fileName: '', mimeType: '' },
      sanitized: true,
      warnings: [`File size ${fileSize} exceeds limit of ${maxSizeBytes} bytes`],
    };
  }

  return { value: { fileName: safeName, mimeType: normalizedMime }, sanitized, warnings };
}

export function sanitizeClipboardHtml(html: unknown): SanitizeResult<string> {
  if (typeof html !== 'string') {
    return { value: '', sanitized: true, warnings: ['Input was not a string'] };
  }

  const warnings: string[] = [];
  let value = html;
  let sanitized = false;

  // Remove script tags and their contents (avoid .test() + .replace() on /g regex)
  let prev = value;
  value = value.replace(/<script[\s\S]*?<\/script>/gi, '');
  if (value !== prev) {
    sanitized = true;
    warnings.push('Script tags removed');
  }

  // Remove event handler attributes
  prev = value;
  value = value.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  if (value !== prev) {
    sanitized = true;
    warnings.push('Event handlers removed');
  }

  // Strip all remaining HTML to plain text for canvas
  value = value.replace(HTML_TAG_RE, '');
  if (value !== html) sanitized = true;

  value = value.replace(NULL_BYTE_RE, '');

  if (value.length > MAX_PASTE_LENGTH) {
    value = value.slice(0, MAX_PASTE_LENGTH);
    sanitized = true;
    warnings.push('Truncated');
  }

  return { value, sanitized, warnings };
}
