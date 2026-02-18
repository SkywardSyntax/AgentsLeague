/**
 * In-memory token-bucket rate limiter (dev/single-instance).
 * Swap to Redis-backed implementation for production multi-instance.
 */

interface RateLimitEntry {
  tokens: number;
  lastRefill: number;
}

const store = new Map<string, RateLimitEntry>();

// Cleanup stale entries every 5 minutes
if (typeof globalThis !== 'undefined' && typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now - entry.lastRefill > 300_000) store.delete(key);
    }
  }, 300_000).unref?.();
}

export interface RateLimitOptions {
  windowMs: number;
  max: number;
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfter?: number;
}

export async function rateLimit(
  key: string,
  opts: RateLimitOptions,
): Promise<RateLimitResult> {
  const now = Date.now();
  let entry = store.get(key);

  if (!entry) {
    entry = { tokens: opts.max, lastRefill: now };
    store.set(key, entry);
  }

  // Token-bucket refill
  const elapsed = now - entry.lastRefill;
  const refill = Math.floor((elapsed / opts.windowMs) * opts.max);
  if (refill > 0) {
    entry.tokens = Math.min(opts.max, entry.tokens + refill);
    entry.lastRefill = now;
  }

  if (entry.tokens <= 0) {
    const retryAfter = Math.ceil((opts.windowMs - elapsed) / 1000);
    return { ok: false, remaining: 0, retryAfter };
  }

  entry.tokens -= 1;
  return { ok: true, remaining: entry.tokens };
}

/** Reset all rate limit state (for testing). */
export function _resetRateLimitStore(): void {
  store.clear();
}

// ── Redis stub for production ─────────────────────────────
// To enable Redis-backed rate limiting, install @upstash/ratelimit
// and @upstash/redis, then implement:
//
// import { Ratelimit } from "@upstash/ratelimit";
// import { Redis } from "@upstash/redis";
//
// const redis = new Redis({
//   url: process.env.UPSTASH_REDIS_URL!,
//   token: process.env.UPSTASH_REDIS_TOKEN!,
// });
//
// const limiter = new Ratelimit({
//   redis,
//   limiter: Ratelimit.slidingWindow(20, "60 s"),
// });
//
// export async function rateLimit(key: string) {
//   const { success, remaining, reset } = await limiter.limit(key);
//   return {
//     ok: success,
//     remaining,
//     retryAfter: success ? undefined : Math.ceil((reset - Date.now()) / 1000),
//   };
// }
