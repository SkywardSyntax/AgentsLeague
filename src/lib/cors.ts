const DEFAULT_ORIGINS = '*';
const ALLOWED_METHODS = 'GET, POST, OPTIONS';
const ALLOWED_HEADERS = 'Content-Type, Authorization, X-API-Key';

function getAllowedOrigins(): string {
  return process.env.ALLOWED_ORIGINS ?? DEFAULT_ORIGINS;
}

/**
 * Clone the response with CORS headers appended.
 * Works with both mutable and immutable Response objects.
 */
export function addCorsHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', getAllowedOrigins());
  headers.set('Access-Control-Allow-Methods', ALLOWED_METHODS);
  headers.set('Access-Control-Allow-Headers', ALLOWED_HEADERS);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** Convenience: return a 204 No Content response with CORS headers (for OPTIONS preflight). */
export function corsPreflightResponse(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': getAllowedOrigins(),
      'Access-Control-Allow-Methods': ALLOWED_METHODS,
      'Access-Control-Allow-Headers': ALLOWED_HEADERS,
      'Access-Control-Max-Age': '86400',
    },
  });
}
