import { describe, it, expect } from 'vitest';
import { QueryEngine, AGENT_DOMAINS, VOCAB, SeededRandom } from '@/lib/agent/queryEngine';
import type { AgentDomain } from '@/lib/agent/queryEngine';

describe('SeededRandom', () => {
  it('produces deterministic output for a given seed', () => {
    const a = new SeededRandom(42);
    const b = new SeededRandom(42);
    for (let i = 0; i < 20; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it('produces different output for different seeds', () => {
    const a = new SeededRandom(42);
    const b = new SeededRandom(99);
    const aVals = Array.from({ length: 10 }, () => a.next());
    const bVals = Array.from({ length: 10 }, () => b.next());
    expect(aVals).not.toEqual(bVals);
  });
});

describe('QueryEngine.generate', () => {
  it('returns a non-empty string for every domain', () => {
    const engine = new QueryEngine(12345);
    for (const domain of AGENT_DOMAINS) {
      const q = engine.generate(domain);
      expect(typeof q).toBe('string');
      expect(q.length).toBeGreaterThan(5);
    }
  });

  it('produces deterministic output for same seed', () => {
    const a = new QueryEngine(42);
    const b = new QueryEngine(42);
    for (const domain of AGENT_DOMAINS) {
      expect(a.generate(domain)).toBe(b.generate(domain));
    }
  });

  it('produces diverse queries over N generations (diversity threshold)', () => {
    const engine = new QueryEngine(1);
    const queries = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const domain = AGENT_DOMAINS[i % AGENT_DOMAINS.length]!;
      queries.add(engine.generate(domain));
    }
    // With compositional grammar + expanded vocab, expect high diversity
    expect(queries.size).toBeGreaterThanOrEqual(80);
  });

  it('output contains vocabulary from the specified domain', () => {
    const engine = new QueryEngine(7);
    for (const domain of AGENT_DOMAINS) {
      const q = engine.generate(domain);
      const vocab = VOCAB[domain];
      const allTokens = [...vocab.subjects, ...vocab.actions, ...vocab.modifiers, ...vocab.relationships];
      const containsAtLeastOne = allTokens.some((token) => q.includes(token));
      expect(containsAtLeastOne).toBe(true);
    }
  });
});

describe('QueryEngine.generateCrossDomain', () => {
  it('returns a non-empty string', () => {
    const engine = new QueryEngine(42);
    const q = engine.generateCrossDomain('biology', 'math');
    expect(typeof q).toBe('string');
    expect(q.length).toBeGreaterThan(5);
  });

  it('contains vocabulary traceable to at least one of the two domains', () => {
    const engine = new QueryEngine(42);
    const pairs: [AgentDomain, AgentDomain][] = [
      ['biology', 'math'],
      ['art', 'physics'],
      ['math', 'art'],
      ['physics', 'biology'],
    ];
    for (const [a, b] of pairs) {
      const q = engine.generateCrossDomain(a, b);
      const tokensA = [...VOCAB[a].subjects, ...VOCAB[a].actions, ...VOCAB[a].modifiers];
      const tokensB = [...VOCAB[b].subjects, ...VOCAB[b].actions, ...VOCAB[b].modifiers];
      const allTokens = [...tokensA, ...tokensB];
      const containsToken = allTokens.some((t) => q.includes(t));
      expect(containsToken).toBe(true);
    }
  });
});

describe('SeededRandom edge cases', () => {
  it('handles seed=0 via guard adjustment', () => {
    const rng = new SeededRandom(0);
    const val = rng.next();
    expect(val).toBeGreaterThanOrEqual(0);
    expect(val).toBeLessThan(1);
  });

  it('handles negative seed via guard adjustment', () => {
    const rng = new SeededRandom(-5);
    const val = rng.next();
    expect(val).toBeGreaterThanOrEqual(0);
    expect(val).toBeLessThan(1);
  });

  it('pick with single-element array always returns that element', () => {
    const rng = new SeededRandom(42);
    for (let i = 0; i < 20; i++) {
      expect(rng.pick(['only'])).toBe('only');
    }
  });

  it('next() returns values in [0, 1) over 1000 iterations', () => {
    const rng = new SeededRandom(123);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('QueryEngine.generateBatch', () => {
  it('returns requested count of queries', () => {
    const engine = new QueryEngine(42);
    const batch = engine.generateBatch(10);
    expect(batch).toHaveLength(10);
  });

  it('has no immediate domain repetition', () => {
    const engine = new QueryEngine(42);
    const batch = engine.generateBatch(20);
    for (let i = 1; i < batch.length; i++) {
      expect(batch[i]!.domain).not.toBe(batch[i - 1]!.domain);
    }
  });

  it('each entry has a non-empty query string', () => {
    const engine = new QueryEngine(42);
    const batch = engine.generateBatch(10);
    for (const entry of batch) {
      expect(typeof entry.query).toBe('string');
      expect(entry.query.length).toBeGreaterThan(5);
      expect(AGENT_DOMAINS).toContain(entry.domain);
    }
  });

  it('is deterministic with same seed', () => {
    const a = new QueryEngine(99);
    const b = new QueryEngine(99);
    const batchA = a.generateBatch(10);
    const batchB = b.generateBatch(10);
    expect(batchA).toEqual(batchB);
  });

  it('returns empty array for count=0', () => {
    const engine = new QueryEngine(42);
    expect(engine.generateBatch(0)).toEqual([]);
  });

  it('returns single entry for count=1 with valid domain', () => {
    const engine = new QueryEngine(42);
    const batch = engine.generateBatch(1);
    expect(batch).toHaveLength(1);
    expect(AGENT_DOMAINS).toContain(batch[0]!.domain);
    expect(batch[0]!.query.length).toBeGreaterThan(0);
  });

  it('covers all 4 domains in a deterministic batch of 20', () => {
    const engine = new QueryEngine(42);
    const batch = engine.generateBatch(20);
    const domains = new Set(batch.map((b) => b.domain));
    expect(domains.size).toBe(4);
    for (const d of AGENT_DOMAINS) {
      expect(domains.has(d)).toBe(true);
    }
  });
});
