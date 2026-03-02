/**
 * Standardized API error response utilities.
 *
 * Enforces a consistent { error, message, requestId? } shape across all routes.
 * For 5xx errors, internal details are sanitized to prevent information leakage.
 */

const SCREAMING_SNAKE_RE = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/;

export interface StandardErrorBody {
  error: string;
  message: string;
  requestId?: string;
  issues?: SimplifiedIssue[];
}

export interface SimplifiedIssue {
  field: string;
  reason: string;
}

export interface ZodLikeIssue {
  path: (string | number)[];
  message: string;
  [key: string]: unknown;
}

/**
 * Create a standard JSON error response.
 *
 * For 5xx status codes the message is replaced with a generic string
 * so that internal details (e.g. DB errors) are never exposed to clients.
 */
export function apiError(
  status: number,
  code: string,
  message: string,
  requestId?: string,
): Response {
  if (!SCREAMING_SNAKE_RE.test(code)) {
    throw new Error(
      `Error code must be SCREAMING_SNAKE_CASE, got: "${code}"`,
    );
  }

  const safeMessage = status >= 500 ? 'An internal error occurred' : message;

  const body: StandardErrorBody = { error: code, message: safeMessage };
  if (requestId) {
    body.requestId = requestId;
  }

  return Response.json(body, {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Create a 400 validation error response with simplified Zod issues.
 *
 * Transforms raw Zod issues into `{ field, reason }` pairs, stripping
 * internal schema details (code, expected, received, etc.).
 */
export function apiValidationError(
  issues: ZodLikeIssue[],
  requestId?: string,
): Response {
  const simplified: SimplifiedIssue[] = issues.map((i) => ({
    field: i.path.join('.') || '(root)',
    reason: i.message,
  }));

  const body: StandardErrorBody = {
    error: 'VALIDATION_ERROR',
    message: 'Request validation failed',
    issues: simplified,
  };
  if (requestId) {
    body.requestId = requestId;
  }

  return Response.json(body, {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  });
}
