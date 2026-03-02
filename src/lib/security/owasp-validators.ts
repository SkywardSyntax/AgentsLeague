/**
 * OWASP validators — security-focused validation utilities for common
 * OWASP Top 10 vulnerability patterns relevant to a client-side web app.
 */

// SQL injection patterns (for any client-side SQL like IndexedDB SQL wrappers)
const SQL_INJECTION_PATTERNS = [
  /'\s*(OR|AND)\s+'[^']*'\s*=\s*'/i,
  /'\s*(OR|AND)\s+\d+\s*=\s*\d+/i,
  /;\s*(DROP|DELETE|UPDATE|INSERT|ALTER|CREATE|EXEC|UNION)\s/i,
  /UNION\s+(ALL\s+)?SELECT\s/i,
  /--\s*$/m,
  /\/\*[\s\S]*?\*\//,
  /'\s*;\s*--/,
  /\bEXEC\s*\(/i,
  /\bxp_cmdshell\b/i,
  /\bSLEEP\s*\(\d+\)/i,
  /\bBENCHMARK\s*\(/i,
  /\bWAITFOR\s+DELAY\b/i,
];

// Path traversal patterns
const PATH_TRAVERSAL_PATTERNS = [
  /\.\.\//,
  /\.\.\\/,
  /\.\.%2[fF]/,
  /\.\.%5[cC]/,
  /%2[eE]%2[eE]%2[fF]/,
  /%2[eE]%2[eE]%5[cC]/,
  /\.\.[/\\]/,
];

// Open redirect patterns
const OPEN_REDIRECT_PATTERNS = [
  /^\/\//,               // Protocol-relative URL
  /^[a-z]+:\/\//i,       // Absolute URL with protocol
  /^\/\\[^/]/,           // Backslash after single slash
  /%2[fF]%2[fF]/,        // Double-encoded slashes
  /\/\/[^/]/,            // Double slash not at start
];

// Header injection patterns
const HEADER_INJECTION_PATTERNS = [
  /\r\n/,
  /\r/,
  /\n/,
  /%0[dD]%0[aA]/,
  /%0[dD]/,
  /%0[aA]/,
];

// Command injection patterns
const COMMAND_INJECTION_PATTERNS = [
  /[;&|`$]/, 
  /\$\(/,
  /`[^`]*`/,
  /\|\s*\w/,
  />\s*\//,
  /\beval\s*\(/i,
  /\bexec\s*\(/i,
];

export interface ValidationResult {
  safe: boolean;
  threats: string[];
}

function checkPatterns(input: string, patterns: RegExp[], threatName: string): string[] {
  const threats: string[] = [];
  for (const pattern of patterns) {
    if (pattern.test(input)) {
      threats.push(threatName);
      break;
    }
  }
  return threats;
}

export function detectSqlInjection(input: string): ValidationResult {
  if (typeof input !== 'string') return { safe: true, threats: [] };
  const threats = checkPatterns(input, SQL_INJECTION_PATTERNS, 'sql_injection');
  return { safe: threats.length === 0, threats };
}

export function detectPathTraversal(path: string): ValidationResult {
  if (typeof path !== 'string') return { safe: true, threats: [] };
  const threats = checkPatterns(path, PATH_TRAVERSAL_PATTERNS, 'path_traversal');
  return { safe: threats.length === 0, threats };
}

export function detectOpenRedirect(url: string): ValidationResult {
  if (typeof url !== 'string') return { safe: true, threats: [] };

  // Allow relative paths starting with single /
  if (url.startsWith('/') && !url.startsWith('//') && !url.startsWith('/\\')) {
    return { safe: true, threats: [] };
  }

  const threats = checkPatterns(url, OPEN_REDIRECT_PATTERNS, 'open_redirect');
  return { safe: threats.length === 0, threats };
}

export function detectHeaderInjection(value: string): ValidationResult {
  if (typeof value !== 'string') return { safe: true, threats: [] };
  const threats = checkPatterns(value, HEADER_INJECTION_PATTERNS, 'header_injection');
  return { safe: threats.length === 0, threats };
}

export function detectCommandInjection(input: string): ValidationResult {
  if (typeof input !== 'string') return { safe: true, threats: [] };
  const threats = checkPatterns(input, COMMAND_INJECTION_PATTERNS, 'command_injection');
  return { safe: threats.length === 0, threats };
}

export function validateInput(
  input: string,
  checks: Array<'sql' | 'path' | 'redirect' | 'header' | 'command'> = ['sql', 'path', 'redirect', 'header', 'command'],
): ValidationResult {
  const allThreats: string[] = [];

  const detectors: Record<string, (i: string) => ValidationResult> = {
    sql: detectSqlInjection,
    path: detectPathTraversal,
    redirect: detectOpenRedirect,
    header: detectHeaderInjection,
    command: detectCommandInjection,
  };

  for (const check of checks) {
    const detector = detectors[check];
    if (detector) {
      const result = detector(input);
      allThreats.push(...result.threats);
    }
  }

  return { safe: allThreats.length === 0, threats: allThreats };
}

export function sanitizePath(path: string): string {
  if (typeof path !== 'string') return '';
  // Remove all traversal sequences
  let result = path;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const next = result.replace(/\.\.[/\\]/g, '').replace(/\.\.$/g, '');
    if (next === result) break;
    result = next;
  }
  return result;
}
