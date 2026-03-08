/**
 * Maps technical error codes/messages from the stream to user-friendly text.
 * Retryable errors include guidance on what the user can do.
 */

interface FriendlyError {
  message: string;
  retryable: boolean;
}

const CODE_MAP: Record<string, FriendlyError> = {
  TURN_TIMEOUT: {
    message: 'Drawing timed out — try a simpler request',
    retryable: true,
  },
  CLIENT_DISCONNECTED: {
    message: 'Connection lost — please check your internet',
    retryable: false,
  },
  RATE_LIMIT: {
    message: 'Too many requests — please wait a moment',
    retryable: true,
  },
  RATE_LIMITED: {
    message: 'Too many requests — please wait a moment',
    retryable: true,
  },
  AUTH_ERROR: {
    message: 'Authentication failed — please reload the page',
    retryable: false,
  },
  API_CONNECTION_ERROR: {
    message: 'Could not reach the server — please check your connection',
    retryable: true,
  },
  STREAM_FAILURE: {
    message: 'Something went wrong — please try again',
    retryable: true,
  },
  MODEL_STREAM_ERROR: {
    message: 'The AI model encountered an issue — please try again',
    retryable: true,
  },
  STREAM_ERROR: {
    message: 'Something went wrong — please try again',
    retryable: true,
  },
};

/**
 * Convert a raw HTTP status or network-level error to friendly text.
 */
function friendlyHttpError(status: number): FriendlyError {
  if (status === 429) return CODE_MAP.RATE_LIMITED!;
  if (status === 408) return { message: 'Request timed out — please try again', retryable: true };
  if (status === 503) return { message: 'Service temporarily unavailable — please try again shortly', retryable: true };
  if (status >= 500) return { message: 'Server error — please try again', retryable: true };
  if (status === 401 || status === 403) return CODE_MAP.AUTH_ERROR!;
  return { message: 'Request failed — please try again', retryable: false };
}

/**
 * Map a raw error string from useAgentStream to a user-friendly error.
 * Handles both code-based errors and freeform error messages.
 */
export function friendlyErrorMessage(raw: string, code?: string): FriendlyError {
  if (code && CODE_MAP[code]) return CODE_MAP[code];

  // Match "Stream request failed with status NNN"
  const statusMatch = raw.match(/status\s+(\d{3})/);
  if (statusMatch) {
    return friendlyHttpError(parseInt(statusMatch[1], 10));
  }

  if (raw.includes('corrupted') || raw.includes('malformed')) {
    return { message: 'Connection was interrupted — please try again', retryable: true };
  }
  if (raw.includes('ended unexpectedly')) {
    return { message: 'Response was cut short — please try again', retryable: true };
  }
  if (raw.toLowerCase().includes('network') || raw.toLowerCase().includes('fetch')) {
    return { message: 'Network error — please check your connection', retryable: true };
  }

  return { message: raw, retryable: false };
}

/**
 * Map an SSE error event code to a friendly message. Accepts optional
 * retryAfterMs from the server to generate a more specific rate-limit message.
 */
export function friendlyEventErrorMessage(
  code: string,
  fallbackMessage: string,
  retryAfterMs?: number,
): FriendlyError {
  if ((code === 'RATE_LIMIT' || code === 'RATE_LIMITED') && retryAfterMs != null) {
    const seconds = Math.ceil(retryAfterMs / 1000);
    return {
      message: `Too many requests — please wait ${seconds} second${seconds !== 1 ? 's' : ''}`,
      retryable: true,
    };
  }
  const mapped = CODE_MAP[code];
  if (mapped) return mapped;
  return { message: fallbackMessage, retryable: false };
}
