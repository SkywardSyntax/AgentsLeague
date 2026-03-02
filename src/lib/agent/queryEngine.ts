export type AgentDomain = 'biology' | 'art' | 'math' | 'physics';

interface DomainVocabulary {
  subjects: string[];
  actions: string[];
  modifiers: string[];
  relationships: string[];
}

const VOCAB: Record<AgentDomain, DomainVocabulary> = {
  biology: {
    subjects: [
      'cell membrane', 'neuron', 'DNA helix', 'mitochondrion', 'leaf cross-section',
      'ribosome', 'synapse', 'chloroplast', 'red blood cell', 'virus capsid',
      'enzyme active site', 'muscle fiber', 'root hair cell',
    ],
    actions: ['draw', 'diagram', 'sketch', 'illustrate', 'map out', 'outline', 'trace'],
    modifiers: ['labeled', 'simplified', 'step-by-step', 'high-contrast', 'annotated', 'exploded-view', 'color-coded'],
    relationships: ['connected to', 'inside', 'around', 'adjacent to', 'feeding into', 'enclosing', 'signaling'],
  },
  art: {
    subjects: [
      'mountain skyline', 'abstract composition', 'portrait silhouette', 'flower arrangement',
      'geometric mosaic', 'ocean horizon', 'city rooftops', 'spiral mandala',
      'autumn canopy', 'starry expanse', 'sand dune ridge',
    ],
    actions: ['compose', 'paint', 'render', 'draft', 'sculpt', 'shade', 'etch'],
    modifiers: ['minimalist', 'bold', 'pastel', 'textured', 'monochrome', 'stippled', 'gradient'],
    relationships: ['blending into', 'contrasting with', 'layered over', 'framed by', 'echoing', 'radiating from', 'dissolving into'],
  },
  math: {
    subjects: [
      'unit circle', 'parabola', 'triangle proof', 'matrix transform grid',
      'Venn diagram', 'number line', 'sine wave', 'fractal curve',
      'coordinate axes', 'histogram', 'tessellation',
    ],
    actions: ['plot', 'graph', 'derive', 'annotate', 'construct', 'partition', 'trace'],
    modifiers: ['with axes', 'with labels', 'color-coded', 'stepwise', 'shaded', 'dashed', 'zoomed-in'],
    relationships: ['mapped to', 'compared with', 'projected onto', 'transformed by', 'tangent to', 'bounded by', 'converging toward'],
  },
  physics: {
    subjects: [
      'free-body diagram', 'circuit loop', 'projectile path', 'wave interference',
      'pendulum arc', 'magnetic field lines', 'lens ray diagram', 'heat flow gradient',
      'spring-mass system', 'capacitor plate', 'standing wave',
    ],
    actions: ['model', 'diagram', 'depict', 'draw', 'simulate', 'trace', 'map'],
    modifiers: ['with vectors', 'labeled', 'with units', 'multi-stage', 'time-lapse', 'equilibrium', 'scaled'],
    relationships: ['acting on', 'flowing through', 'reflecting from', 'oscillating around', 'opposing', 'parallel to', 'perpendicular to'],
  },
};

/**
 * Grammar-based compositional generation.
 *
 * Instead of fixed sentence templates, the engine builds queries by recursively
 * expanding grammar productions. Each production is itself randomly composed,
 * making the output space combinatorially large rather than bounded to a fixed
 * set of sentence shapes.
 */

// Grammar production types — each returns a sentence fragment
type Fragment = (rng: SeededRandom, vocab: DomainVocabulary) => string;

// Atomic productions (leaf nodes)
const ATOM_SUBJECT: Fragment = (rng, v) => rng.pick(v.subjects);
const ATOM_ACTION: Fragment = (rng, v) => rng.pick(v.actions);
const ATOM_MOD: Fragment = (rng, v) => rng.pick(v.modifiers);
const ATOM_REL: Fragment = (rng, v) => rng.pick(v.relationships);

// Compound productions (compose atoms into phrases)
const PHRASE_MODIFIED_SUBJECT: Fragment = (rng, v) =>
  `${ATOM_MOD(rng, v)} ${ATOM_SUBJECT(rng, v)}`;

const PHRASE_RELATED_PAIR: Fragment = (rng, v) =>
  `${ATOM_SUBJECT(rng, v)} ${ATOM_REL(rng, v)} ${ATOM_SUBJECT(rng, v)}`;

const PHRASE_ACTION_SUBJECT: Fragment = (rng, v) =>
  `${ATOM_ACTION(rng, v)} ${ATOM_SUBJECT(rng, v)}`;

// Sentence-level productions (compose phrases into complete queries)
// These are grammar rules, not fixed templates — the internal phrase selection
// is itself random and compositional.
const SENTENCE_RULES: Fragment[] = [
  // S → action + modified-subject + relation + subject
  (rng, v) => `${ATOM_ACTION(rng, v)} a ${PHRASE_MODIFIED_SUBJECT(rng, v)} ${ATOM_REL(rng, v)} a ${ATOM_SUBJECT(rng, v)}`,
  // S → "first" + action-subject + ", then" + action-subject + modifier
  (rng, v) => `first ${PHRASE_ACTION_SUBJECT(rng, v)}, then ${PHRASE_ACTION_SUBJECT(rng, v)} with ${ATOM_MOD(rng, v)} detail`,
  // S → action + subject + "and" + subject + relation + "each other"
  (rng, v) => `${ATOM_ACTION(rng, v)} ${ATOM_SUBJECT(rng, v)} and ${ATOM_SUBJECT(rng, v)} ${ATOM_REL(rng, v)} each other`,
  // S → "compare" + subject + "with" + subject + modifier
  (rng, v) => `compare ${ATOM_SUBJECT(rng, v)} with ${ATOM_SUBJECT(rng, v)} using a ${ATOM_MOD(rng, v)} layout`,
  // S → action + related-pair + modifier + "annotations"
  (rng, v) => `${ATOM_ACTION(rng, v)} ${PHRASE_RELATED_PAIR(rng, v)} with ${ATOM_MOD(rng, v)} annotations`,
  // S → "show how" + subject + relation + subject + "using" + modified diagram
  (rng, v) => `show how ${ATOM_SUBJECT(rng, v)} ${ATOM_REL(rng, v)} ${ATOM_SUBJECT(rng, v)} using a ${ATOM_MOD(rng, v)} diagram`,
  // S → action + modified-subject + ", then overlay" + modified-subject
  (rng, v) => `${ATOM_ACTION(rng, v)} a ${PHRASE_MODIFIED_SUBJECT(rng, v)}, then overlay a ${PHRASE_MODIFIED_SUBJECT(rng, v)}`,
  // S → "step-by-step:" + action-subject + ", then" + action + modified-subject
  (rng, v) => `step-by-step: ${PHRASE_ACTION_SUBJECT(rng, v)}, then ${ATOM_ACTION(rng, v)} a ${PHRASE_MODIFIED_SUBJECT(rng, v)}`,
];

export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed % 2147483647;
    if (this.state <= 0) this.state += 2147483646;
  }

  next(): number {
    this.state = (this.state * 16807) % 2147483647;
    return (this.state - 1) / 2147483646;
  }

  pick<T>(items: T[]): T {
    if (items.length === 0) throw new Error('pick() called with empty array');
    return items[Math.floor(this.next() * items.length)]!;
  }
}

export class QueryEngine {
  private readonly rng: SeededRandom;

  constructor(seed = Date.now()) {
    this.rng = new SeededRandom(seed);
  }

  /** Generate a single query for one domain using grammar-based composition. */
  generate(domain: AgentDomain): string {
    const vocab = VOCAB[domain];
    const rule = this.rng.pick(SENTENCE_RULES);
    return rule(this.rng, vocab);
  }

  /** Generate a cross-domain query combining vocabulary from two domains. */
  generateCrossDomain(domainA: AgentDomain, domainB: AgentDomain): string {
    const vocabA = VOCAB[domainA];
    const vocabB = VOCAB[domainB];
    // Merge vocabularies for cross-domain composition
    const merged: DomainVocabulary = {
      subjects: [...vocabA.subjects, ...vocabB.subjects],
      actions: [...vocabA.actions, ...vocabB.actions],
      modifiers: [...vocabA.modifiers, ...vocabB.modifiers],
      relationships: [...vocabA.relationships, ...vocabB.relationships],
    };
    // Use a rule that naturally references two subjects (likely from different domains)
    const rule = this.rng.pick(SENTENCE_RULES);
    return rule(this.rng, merged);
  }

  /** Generate a batch of diverse queries with no immediate domain repeat. */
  generateBatch(count: number): { domain: AgentDomain; query: string }[] {
    const results: { domain: AgentDomain; query: string }[] = [];
    let lastDomain: AgentDomain | null = null;
    for (let i = 0; i < count; i++) {
      const available = AGENT_DOMAINS.filter((d) => d !== lastDomain);
      const domain = this.rng.pick(available);
      // ~20% chance of cross-domain query
      const isCross = this.rng.next() < 0.2;
      const query = isCross
        ? this.generateCrossDomain(domain, this.rng.pick(AGENT_DOMAINS.filter((d) => d !== domain)))
        : this.generate(domain);
      results.push({ domain, query });
      lastDomain = domain;
    }
    return results;
  }
}

export const AGENT_DOMAINS: AgentDomain[] = ['biology', 'art', 'math', 'physics'];
export { VOCAB };
