/**
 * Test fixtures for the AI Whiteboard application.
 *
 * - Sample DrawElement objects for each shape type
 * - Sample Message objects
 * - Sample WhiteboardState objects
 * - Canvas scenarios (empty, 50 elements, 1000 elements)
 */

import type {
  RectElement,
  EllipseElement,
  LineElement,
  ArrowElement,
  FreehandElement,
  TextElement,
  ImageElement,
  DrawElement,
  StrokeStyle,
  FillStyle,
  TextStyle,
  Camera,
} from '@/types/drawing';
import {
  InteractionMode,
  MessageRole,
  type Message,
  type VoiceSession,
  VoiceState,
} from '@/types/interaction';
import type { WhiteboardState } from '@/types/state';

// ── Shared base values ──────────────────────────────────────────────

const now = 1700000000000;

const baseProps = {
  rotation: 0,
  opacity: 1,
  locked: false,
  createdAt: now,
  updatedAt: now,
} as const;

export const defaultStroke: StrokeStyle = {
  color: '#333333',
  width: 2,
  lineCap: 'round',
  lineJoin: 'round',
};

export const defaultFill: FillStyle = {
  type: 'solid',
  color: '#3B82F6',
  opacity: 1,
};

export const noFill: FillStyle = {
  type: 'none',
  color: '#000000',
  opacity: 0,
};

export const defaultTextStyle: TextStyle = {
  fontFamily: 'Inter',
  fontSize: 16,
  fontWeight: 400,
  lineHeight: 1.4,
  letterSpacing: 0,
  color: '#000000',
  align: 'left',
};

export const defaultCamera: Camera = { x: 0, y: 0, zoom: 1 };

// ── DrawElement Fixtures ────────────────────────────────────────────

export const rectElement: RectElement = {
  ...baseProps,
  id: 'rect-1',
  type: 'rect',
  x: 100,
  y: 200,
  w: 300,
  h: 150,
  cornerRadius: 8,
  fill: defaultFill,
  stroke: defaultStroke,
};

export const ellipseElement: EllipseElement = {
  ...baseProps,
  id: 'ellipse-1',
  type: 'ellipse',
  x: 400,
  y: 300,
  rx: 60,
  ry: 40,
  fill: { type: 'solid', color: '#EF4444', opacity: 1 },
  stroke: defaultStroke,
};

export const lineElement: LineElement = {
  ...baseProps,
  id: 'line-1',
  type: 'line',
  x: 0,
  y: 0,
  points: [
    { x: 50, y: 50 },
    { x: 200, y: 100 },
    { x: 350, y: 75 },
  ],
  stroke: defaultStroke,
};

export const arrowElement: ArrowElement = {
  ...baseProps,
  id: 'arrow-1',
  type: 'arrow',
  x: 0,
  y: 0,
  points: [
    { x: 100, y: 500 },
    { x: 400, y: 500 },
  ],
  stroke: { ...defaultStroke, width: 3 },
  startArrowhead: 'none',
  endArrowhead: 'arrow',
};

export const freehandElement: FreehandElement = {
  ...baseProps,
  id: 'freehand-1',
  type: 'freehand',
  x: 0,
  y: 0,
  points: [
    { x: 10, y: 10 },
    { x: 15, y: 18 },
    { x: 22, y: 14 },
    { x: 30, y: 20 },
    { x: 40, y: 16 },
  ],
  pressures: [0.3, 0.6, 0.8, 0.5, 0.2],
  stroke: defaultStroke,
};

export const textElement: TextElement = {
  ...baseProps,
  id: 'text-1',
  type: 'text',
  x: 150,
  y: 50,
  content: 'Hello World',
  w: 200,
  h: 30,
  style: defaultTextStyle,
};

export const imageElement: ImageElement = {
  ...baseProps,
  id: 'image-1',
  type: 'image',
  x: 500,
  y: 100,
  src: 'https://example.com/logo.png',
  w: 200,
  h: 150,
  naturalWidth: 800,
  naturalHeight: 600,
};

/** All shape types in a single array. */
export const allElements: DrawElement[] = [
  rectElement,
  ellipseElement,
  lineElement,
  arrowElement,
  freehandElement,
  textElement,
  imageElement,
];

// ── Message Fixtures ────────────────────────────────────────────────

export const userMessage: Message = {
  id: 'msg-user-1',
  role: MessageRole.USER,
  content: 'Draw a blue rectangle',
  timestamp: now,
  source: InteractionMode.TEXT,
  drawing: null,
  reasoning: null,
};

export const assistantMessage: Message = {
  id: 'msg-assistant-1',
  role: MessageRole.ASSISTANT,
  content: 'I\'ve drawn a blue rectangle on the canvas.',
  timestamp: now + 1000,
  source: InteractionMode.TEXT,
  drawing: {
    action: 'create',
    objects: [
      { type: 'rect', id: 'rect-1', props: { x: 100, y: 200, width: 300, height: 150, fill: '#3B82F6' } },
    ],
  },
  reasoning: null,
  meta: { streamComplete: true, drawObjectIds: ['rect-1'] },
};

export const voiceMessage: Message = {
  id: 'msg-voice-1',
  role: MessageRole.USER,
  content: 'Draw a red circle',
  timestamp: now + 2000,
  source: InteractionMode.VOICE,
  drawing: null,
  reasoning: null,
  meta: { voiceTranscriptConfidence: 0.92 },
};

export const reasoningMessage: Message = {
  id: 'msg-reasoning-1',
  role: MessageRole.REASONING,
  content: 'Analyzing the request...\nPlanning shape placement...',
  timestamp: now + 3000,
  source: InteractionMode.TEXT,
  drawing: null,
  reasoning: { steps: ['Analyzing the request...', 'Planning shape placement...'], confidence: 0.88 },
};

export const sampleMessages: Message[] = [
  userMessage,
  assistantMessage,
  voiceMessage,
  reasoningMessage,
];

// ── WhiteboardState Fixtures ────────────────────────────────────────

export const idleState: WhiteboardState = { status: 'idle' };

export const processingState: WhiteboardState = {
  status: 'processing',
  prompt: 'Draw a flowchart',
  requestId: 'req-001',
};

export const errorState: WhiteboardState = {
  status: 'error',
  message: 'Rate limit exceeded',
  retryable: true,
  previousStatus: 'processing',
};

// ── Voice Session Fixtures ──────────────────────────────────────────

export const idleVoiceSession: VoiceSession = {
  state: VoiceState.IDLE,
  interimTranscript: '',
  finalTranscript: '',
  confidence: 0,
  error: null,
};

export const listeningVoiceSession: VoiceSession = {
  state: VoiceState.LISTENING,
  interimTranscript: 'draw a',
  finalTranscript: '',
  confidence: 0,
  error: null,
};

// ── Canvas Scenarios ────────────────────────────────────────────────

function generateRect(index: number): RectElement {
  return {
    ...baseProps,
    id: `rect-${index}`,
    type: 'rect',
    x: (index * 47) % 1800,
    y: (index * 31) % 1000,
    w: 50 + (index % 5) * 30,
    h: 30 + (index % 4) * 20,
    cornerRadius: index % 3 === 0 ? 8 : 0,
    fill: {
      type: 'solid',
      color: `#${((index * 7919) % 0xFFFFFF).toString(16).padStart(6, '0')}` as `#${string}`,
      opacity: 0.5 + (index % 5) * 0.1,
    },
    stroke: defaultStroke,
    createdAt: now + index,
    updatedAt: now + index,
  };
}

function generateMixedElement(index: number): DrawElement {
  const types = ['rect', 'ellipse', 'line', 'text'] as const;
  const type = types[index % types.length]!;

  switch (type) {
    case 'rect':
      return generateRect(index);
    case 'ellipse':
      return {
        ...baseProps,
        id: `ellipse-${index}`,
        type: 'ellipse',
        x: (index * 53) % 1800,
        y: (index * 37) % 1000,
        rx: 20 + (index % 6) * 10,
        ry: 15 + (index % 4) * 8,
        fill: defaultFill,
        stroke: defaultStroke,
        createdAt: now + index,
        updatedAt: now + index,
      } as EllipseElement;
    case 'line':
      return {
        ...baseProps,
        id: `line-${index}`,
        type: 'line',
        x: 0,
        y: 0,
        points: [
          { x: (index * 41) % 1800, y: (index * 29) % 1000 },
          { x: (index * 41 + 100) % 1800, y: (index * 29 + 80) % 1000 },
        ],
        stroke: defaultStroke,
        createdAt: now + index,
        updatedAt: now + index,
      } as LineElement;
    case 'text':
      return {
        ...baseProps,
        id: `text-${index}`,
        type: 'text',
        x: (index * 59) % 1800,
        y: (index * 43) % 1000,
        content: `Label ${index}`,
        w: 100,
        h: 24,
        style: defaultTextStyle,
        createdAt: now + index,
        updatedAt: now + index,
      } as TextElement;
  }
}

/** Empty canvas scenario. */
export const emptyCanvas: DrawElement[] = [];

/** 50-element canvas scenario — typical working state. */
export const canvas50: DrawElement[] = Array.from({ length: 50 }, (_, i) =>
  generateMixedElement(i),
);

/** 1000-element canvas scenario — stress test. */
export const canvas1000: DrawElement[] = Array.from({ length: 1000 }, (_, i) =>
  generateMixedElement(i),
);

// ── Helper to build element maps ────────────────────────────────────

export function toElementMap(elements: DrawElement[]): Map<string, DrawElement> {
  return new Map(elements.map((el) => [el.id, el]));
}
