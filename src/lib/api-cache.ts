/**
 * In-memory API response cache with ETag support.
 *
 * - LRU eviction when capacity is exceeded
 * - TTL-based expiration
 * - ETag generation via content hashing
 * - Drawing spec cache keyed by normalized prompt
 */

import { createHash } from 'crypto';

// ── ETag generation ─────────────────────────────────────────────────

export function generateETag(content: string): string {
  const hash = createHash('md5').update(content).digest('hex').slice(0, 16);
  return `"${hash}"`;
}

/** Standard cache headers for cacheable responses. */
export function cacheHeaders(etag: string, maxAge = 60): Record<string, string> {
  return {
    'Cache-Control': `public, max-age=${maxAge}, stale-while-revalidate=${maxAge * 2}`,
    ETag: etag,
    Vary: 'Accept-Encoding',
  };
}

/** Check If-None-Match header against an ETag. */
export function isNotModified(request: Request, etag: string): boolean {
  const ifNoneMatch = request.headers.get('If-None-Match');
  return ifNoneMatch === etag;
}

// ── LRU Cache ───────────────────────────────────────────────────────

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  etag: string;
}

export class LRUCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private readonly maxSize: number;
  private readonly ttlMs: number;

  constructor(maxSize = 100, ttlMs = 300_000) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  get(key: string): CacheEntry<T> | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry;
  }

  set(key: string, value: T, etag: string): void {
    if (this.cache.size >= this.maxSize) {
      // Evict oldest (first key)
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) this.cache.delete(firstKey);
    }
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
      etag,
    });
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  get size(): number {
    return this.cache.size;
  }

  clear(): void {
    this.cache.clear();
  }
}

// ── Drawing spec cache ──────────────────────────────────────────────

/** Normalize a prompt for cache-key generation. */
function normalizePrompt(prompt: string): string {
  return prompt.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Generate a cache key from prompt + conversation context. */
export function drawingCacheKey(prompt: string, historyLength: number): string {
  const normalized = normalizePrompt(prompt);
  return createHash('sha256').update(`${normalized}:${historyLength}`).digest('hex').slice(0, 24);
}

// Singleton drawing spec cache (5 min TTL, 50 entries max)
export const drawingSpecCache = new LRUCache<string>(50, 300_000);
