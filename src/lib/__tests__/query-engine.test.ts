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

describe('QueryEngine.generateBatch edge cases', () => {
  it('generateBatch with count=1 returns single entry', () => {
    const engine = new QueryEngine(42);
    const batch = engine.generateBatch(1);
    expect(batch).toHaveLength(1);
    expect(batch[0]!.query.length).toBeGreaterThan(0);
    expect(AGENT_DOMAINS).toContain(batch[0]!.domain);
  });

  it('generateBatch with count=0 returns empty array', () => {
    const engine = new QueryEngine(42);
    const batch = engine.generateBatch(0);
    expect(batch).toHaveLength(0);
  });

  it('generateBatch covers all domains in a large batch', () => {
    const engine = new QueryEngine(42);
    const batch = engine.generateBatch(40);
    const domains = new Set(batch.map((e) => e.domain));
    for (const d of AGENT_DOMAINS) {
      expect(domains).toContain(d);
    }
  });
});

describe('SeededRandom seed edge cases', () => {
  it('seed=0 produces valid output', () => {
    const rng = new SeededRandom(0);
    const val = rng.next();
    expect(val).toBeGreaterThanOrEqual(0);
    expect(val).toBeLessThan(1);
  });

  it('seed=-1 produces valid output', () => {
    const rng = new SeededRandom(-1);
    const val = rng.next();
    expect(val).toBeGreaterThanOrEqual(0);
    expect(val).toBeLessThan(1);
  });

  it('seed=Number.MAX_SAFE_INTEGER produces valid output', () => {
    const rng = new SeededRandom(Number.MAX_SAFE_INTEGER);
    const val = rng.next();
    expect(val).toBeGreaterThanOrEqual(0);
    expect(val).toBeLessThan(1);
  });

  it('pick() never returns undefined (index-safety)', () => {
    const items = ['a', 'b', 'c'];
    // Run many iterations across different seeds to exercise boundary values
    for (let seed = 0; seed < 1000; seed++) {
      const rng = new SeededRandom(seed);
      for (let i = 0; i < 50; i++) {
        const picked = rng.pick(items);
        expect(picked).toBeDefined();
        expect(items).toContain(picked);
      }
    }
  });
});

describe('QueryEngine seed edge cases', () => {
  it('seed=0 generates valid non-empty queries', () => {
    const engine = new QueryEngine(0);
    for (const domain of AGENT_DOMAINS) {
      const q = engine.generate(domain);
      expect(q).toBeTruthy();
      expect(q.length).toBeGreaterThan(5);
    }
  });

  it('seed=-1 generates valid non-empty queries', () => {
    const engine = new QueryEngine(-1);
    for (const domain of AGENT_DOMAINS) {
      const q = engine.generate(domain);
      expect(q).toBeTruthy();
      expect(q.length).toBeGreaterThan(5);
    }
  });

  it('seed=Number.MAX_SAFE_INTEGER generates valid non-empty queries', () => {
    const engine = new QueryEngine(Number.MAX_SAFE_INTEGER);
    for (const domain of AGENT_DOMAINS) {
      const q = engine.generate(domain);
      expect(q).toBeTruthy();
      expect(q.length).toBeGreaterThan(5);
    }
  });

  it('two instances with same seed produce identical first 20 queries', () => {
    const a = new QueryEngine(777);
    const b = new QueryEngine(777);
    for (let i = 0; i < 20; i++) {
      const domain = AGENT_DOMAINS[i % AGENT_DOMAINS.length]!;
      expect(a.generate(domain)).toBe(b.generate(domain));
    }
  });

  it('full cycle: 2x AGENT_DOMAINS.length queries cover every domain', () => {
    const engine = new QueryEngine(42);
    const batch = engine.generateBatch(AGENT_DOMAINS.length * 2);
    const domains = new Set(batch.map((e) => e.domain));
    expect(domains.size).toBe(AGENT_DOMAINS.length);
  });
});
