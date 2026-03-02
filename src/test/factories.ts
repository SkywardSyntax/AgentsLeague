import type {
  DrawElement,
  DrawBatch,
  SemanticBatch,
  ChatMessage,
  StrokeTrajectory,
  Point,
  RectElement,
  SemanticBlock,
  StylePreset,
} from '@/types/agent';

let _counter = 0;
function uid(prefix: string): string {
  return `${prefix}-${++_counter}`;
}

export function buildPoint(x = 0, y = 0): Point {
  return { x, y };
}

export function buildPoints(
  count: number,
  opts?: { spread?: number },
): Point[] {
  const spread = opts?.spread ?? 10;
  return Array.from({ length: count }, (_, i) => ({
    x: i * spread,
    y: i * spread,
  }));
}

export function buildDrawElement(
  overrides?: Partial<RectElement>,
): DrawElement {
  return {
    type: 'rect',
    id: uid('el'),
    x: 0,
    y: 0,
    w: 100,
    h: 50,
    ...overrides,
  } as DrawElement;
}

export function buildDrawBatch(overrides?: Partial<DrawBatch>): DrawBatch {
  return {
    batch_id: uid('batch'),
    elements: [buildDrawElement()],
    ...overrides,
  };
}

export function buildSemanticBatch(
  overrides?: Partial<SemanticBatch>,
): SemanticBatch {
  const defaultBlock: SemanticBlock = {
    id: uid('block'),
    kind: 'equation_stack',
    lines: [{ id: uid('line'), tex: 'x^2' }],
  };
  return {
    batch_id: uid('sbatch'),
    template: 'equation_derivation_vertical',
    blocks: [defaultBlock],
    ...overrides,
  };
}

export function buildChatMessage(
  overrides?: Partial<ChatMessage>,
): ChatMessage {
  return {
    id: uid('msg'),
    role: 'user',
    content: 'Hello',
    createdAt: Date.now(),
    ...overrides,
  };
}

export function buildStrokeTrajectory(
  overrides?: Partial<StrokeTrajectory>,
): StrokeTrajectory {
  return {
    id: uid('stroke'),
    elementId: uid('el'),
    points: buildPoints(5),
    color: '#000000',
    baseWidth: 2,
    ...overrides,
  };
}
