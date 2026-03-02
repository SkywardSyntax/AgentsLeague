export type AgentDomain = 'biology' | 'art' | 'math' | 'physics';

interface DomainVocabulary {
  subjects: string[];
  actions: string[];
  modifiers: string[];
  relationships: string[];
}

const VOCAB: Record<AgentDomain, DomainVocabulary> = {
  biology: {
    subjects: ['cell membrane', 'neuron', 'DNA helix', 'mitochondrion', 'leaf cross-section'],
    actions: ['draw', 'diagram', 'sketch', 'illustrate'],
    modifiers: ['labeled', 'simplified', 'step-by-step', 'high-contrast'],
    relationships: ['connected to', 'inside', 'around', 'adjacent to'],
  },
  art: {
    subjects: ['mountain skyline', 'abstract composition', 'portrait silhouette', 'flower arrangement'],
    actions: ['compose', 'paint', 'render', 'draft'],
    modifiers: ['minimalist', 'bold', 'pastel', 'textured'],
    relationships: ['blending into', 'contrasting with', 'layered over', 'framed by'],
  },
  math: {
    subjects: ['unit circle', 'parabola', 'triangle proof', 'matrix transform grid'],
    actions: ['plot', 'graph', 'derive', 'annotate'],
    modifiers: ['with axes', 'with labels', 'color-coded', 'stepwise'],
    relationships: ['mapped to', 'compared with', 'projected onto', 'transformed by'],
  },
  physics: {
    subjects: ['free-body diagram', 'circuit loop', 'projectile path', 'wave interference'],
    actions: ['model', 'diagram', 'depict', 'draw'],
    modifiers: ['with vectors', 'labeled', 'with units', 'multi-stage'],
    relationships: ['acting on', 'flowing through', 'reflecting from', 'oscillating around'],
  },
};

class SeededRandom {
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
    return items[Math.floor(this.next() * items.length)]!;
  }
}

export class QueryEngine {
  private readonly rng: SeededRandom;

  constructor(seed = Date.now()) {
    this.rng = new SeededRandom(seed);
  }

  generate(domain: AgentDomain): string {
    const vocab = VOCAB[domain];

    const pattern = this.rng.pick([
      () =>
        `${this.rng.pick(vocab.actions)} a ${this.rng.pick(vocab.modifiers)} ${this.rng.pick(vocab.subjects)} ${this.rng.pick(vocab.relationships)} a ${this.rng.pick(vocab.subjects)}`,
      () =>
        `first ${this.rng.pick(vocab.actions)} a ${this.rng.pick(vocab.subjects)}, then add ${this.rng.pick(vocab.modifiers)} annotations`,
      () =>
        `${this.rng.pick(vocab.actions)} ${this.rng.pick(vocab.subjects)} and ${this.rng.pick(vocab.subjects)} ${this.rng.pick(vocab.relationships)} each other`,
    ]);

    return pattern();
  }
}

export const AGENT_DOMAINS: AgentDomain[] = ['biology', 'art', 'math', 'physics'];
