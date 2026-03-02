const ERROR_MAP: Array<{ pattern: RegExp; message: string }> = [
  { pattern: /status\s+503/i, message: "The service is temporarily busy. Please try again in a moment." },
  { pattern: /status\s+429/i, message: "Too many requests. Please wait a moment before trying again." },
  { pattern: /status\s+401/i, message: "Authentication failed. Please check your API key configuration." },
  { pattern: /status\s+5\d{2}/i, message: "Something went wrong on our end. Please try again." },
  { pattern: /status\s+4\d{2}/i, message: "The request couldn't be processed. Please try rephrasing your message." },
  { pattern: /SSE JSON payload/i, message: "The response was interrupted. Please try sending your message again." },
  { pattern: /stream aborted/i, message: "The connection was lost. Please try again." },
  { pattern: /AbortError/i, message: "" },
  { pattern: /network|fetch|ECONNREFUSED/i, message: "Unable to connect. Please check your internet connection." },
  { pattern: /timeout/i, message: "The request took too long. Please try again with a simpler question." },
];

export function formatUserError(technical: string): string {
  for (const { pattern, message } of ERROR_MAP) {
    if (pattern.test(technical)) return message;
  }
  return "Something went wrong. Please try again.";
}
