/**
 * OpenAI draw tool definition — the function schema sent to the
 * Responses API so the model emits structured drawing specs.
 *
 * Reference: openai-whiteboard-integration-plan.md §2.1
 */

import { z } from 'zod';

// ── Element types the model can emit ────────────────────────────────

export const ELEMENT_TYPES = [
  'rectangle',
  'ellipse',
  'line',
  'arrow',
  'path',
  'text',
  'image',
  'group',
] as const;

export type DrawElementType = (typeof ELEMENT_TYPES)[number];

// ── Draw operation types ────────────────────────────────────────────

export const DRAW_OPERATIONS = [
  'rect',
  'ellipse',
  'line',
  'arrow',
  'path',
  'text',
  'image',
  'group',
  'erase',
  'move',
  'undo',
] as const;

export type DrawOperationType = (typeof DRAW_OPERATIONS)[number];

// ── Zod schemas for tool call validation ────────────────────────────

export const ElementStyleSchema = z.object({
  fill: z.string().optional(),
  stroke: z.string().optional(),
  strokeWidth: z.number().optional(),
  opacity: z.number().min(0).max(1).optional(),
  borderRadius: z.number().optional(),
  fontSize: z.number().optional(),
  fontFamily: z.string().optional(),
  fontWeight: z.enum(['normal', 'bold']).optional(),
  textAlign: z.enum(['left', 'center', 'right']).optional(),
  color: z.string().optional(),
});

export const DrawToolElementSchema = z.object({
  id: z.string(),
  type: z.enum(ELEMENT_TYPES),
  x: z.number(),
  y: z.number(),
  width: z.number().optional(),
  height: z.number().optional(),
  rotation: z.number().optional(),
  style: ElementStyleSchema.optional(),
  text: z.string().optional(),
  points: z.array(z.array(z.number())).optional(),
  children: z.array(z.string()).optional(),
});

export const CanvasSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
});

export const DrawToolArgsSchema = z.object({
  canvas: CanvasSchema,
  elements: z.array(DrawToolElementSchema),
});

// ── Inferred types ──────────────────────────────────────────────────

export type ElementStyle = z.infer<typeof ElementStyleSchema>;
export type DrawToolElement = z.infer<typeof DrawToolElementSchema>;
export type Canvas = z.infer<typeof CanvasSchema>;
export type DrawToolArgs = z.infer<typeof DrawToolArgsSchema>;

// ── JSON Schema for the Responses API function tool ─────────────────

export const DRAW_TOOL_DEFINITION = {
  type: 'function' as const,
  name: 'draw',
  description:
    'Renders drawing elements onto the whiteboard canvas. Call this tool with a complete drawing specification containing shapes, text, connectors, and groups. Every user request MUST result in at least one draw() call. Do not respond with text alone.',
  parameters: {
    type: 'object',
    properties: {
      canvas: {
        type: 'object',
        description: 'Canvas configuration',
        properties: {
          width: { type: 'number', description: 'Canvas width in px' },
          height: { type: 'number', description: 'Canvas height in px' },
        },
        required: ['width', 'height'],
        additionalProperties: false,
      },
      elements: {
        type: 'array',
        description:
          'Ordered list of drawing elements, rendered bottom-to-top (index 0 = backmost).',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: "Unique element ID (e.g. 'rect-1')" },
            type: {
              type: 'string',
              enum: [...ELEMENT_TYPES],
              description: 'Element type',
            },
            x: { type: 'number', description: 'X position (top-left origin)' },
            y: { type: 'number', description: 'Y position (top-left origin)' },
            width: { type: 'number' },
            height: { type: 'number' },
            rotation: { type: 'number', description: 'Rotation in degrees, default 0' },
            style: {
              type: 'object',
              properties: {
                fill: { type: 'string', description: "CSS color, e.g. '#3B82F6' or 'transparent'" },
                stroke: { type: 'string', description: 'Stroke color' },
                strokeWidth: { type: 'number', description: 'Stroke width in px' },
                opacity: { type: 'number', description: '0.0-1.0' },
                borderRadius: { type: 'number', description: 'Corner radius in px' },
                fontSize: { type: 'number' },
                fontFamily: { type: 'string' },
                fontWeight: { type: 'string', enum: ['normal', 'bold'] },
                textAlign: { type: 'string', enum: ['left', 'center', 'right'] },
                color: { type: 'string', description: 'Text color' },
              },
              additionalProperties: false,
            },
            text: { type: 'string', description: 'Text content (for type=text)' },
            points: {
              type: 'array',
              description: 'For line/arrow/path: array of [x, y] coordinate pairs',
              items: { type: 'array', items: { type: 'number' } },
            },
            children: {
              type: 'array',
              description: 'Child element IDs (for type=group)',
              items: { type: 'string' },
            },
          },
          required: ['id', 'type', 'x', 'y'],
          additionalProperties: false,
        },
      },
    },
    required: ['canvas', 'elements'],
    additionalProperties: false,
  },
  strict: true,
} as const;

// ── System prompt ───────────────────────────────────────────────────

export const SYSTEM_PROMPT = `You are an AI whiteboard assistant.

RULES:
- ALWAYS call draw() — never respond with plain text.
- Use MINIMAL elements to convey the idea.
- Default canvas: 1920×1080. Coords: (0,0) = top-left.
- Prefer simple shapes. Avoid excessive detail.
- Max 50 elements per draw() call.
- Use groups to organize related elements.
- IDs: kebab-case (e.g. "header-text", "flow-arrow-1").

SHORTCUTS:
- "flowchart" → rectangles + arrows + text labels
- "diagram"   → shapes + connectors + labels
- "sticky"    → rounded rect (fill: #FEF08A) + text
- "card"      → white rounded rect, shadow via slight offset`;
