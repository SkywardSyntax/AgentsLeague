import OpenAI from 'openai';
import { getServerEnv } from './env';
import {
  STYLE_PRESETS,
  TEMPLATES,
  INTENTS,
  DRAW_ELEMENT_TYPES,
  LATEX_ALIGN,
  EQUATION_ROLES,
  BLOCK_KINDS,
  REGION_HINTS,
  EQUATION_ALIGN,
  PANEL_SHAPE_TYPES,
  CAPTION_ANCHORS,
  RELATION_TYPES,
} from '../schema';

export function createOpenAIClient() {
  const env = getServerEnv();
  return new OpenAI({
    apiKey: env.apiKey,
    baseURL: env.baseUrl,
    defaultHeaders: env.extraHeaders,
    timeout: 60_000,
    maxRetries: 1,
  });
}

export function getModel() {
  return getServerEnv().model;
}

export const DRAW_TOOL_DEFINITION = {
  type: 'function' as const,
  name: 'emit_draw_batch',
  description:
    'Emit a whiteboard drawing batch. Use this when a visual explanation helps. Can be called between text segments.',
  strict: false,
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      batch_id: { type: 'string' },
      style_preset: {
        type: 'string',
        enum: [...STYLE_PRESETS],
      },
      elements: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string' },
            type: { type: 'string', enum: [...DRAW_ELEMENT_TYPES] },
            x: { type: 'number' },
            y: { type: 'number' },
            w: { type: 'number' },
            h: { type: 'number' },
            cx: { type: 'number' },
            cy: { type: 'number' },
            rx: { type: 'number' },
            ry: { type: 'number' },
            width: { type: 'number' },
            height: { type: 'number' },
            x1: { type: 'number' },
            y1: { type: 'number' },
            x2: { type: 'number' },
            y2: { type: 'number' },
            from: {
              type: 'object',
              additionalProperties: false,
              properties: { x: { type: 'number' }, y: { type: 'number' } },
              required: ['x', 'y'],
            },
            to: {
              type: 'object',
              additionalProperties: false,
              properties: { x: { type: 'number' }, y: { type: 'number' } },
              required: ['x', 'y'],
            },
            text: { type: 'string' },
            content: { type: 'string' },
            tex: { type: 'string' },
            latex: { type: 'string' },
            size: { type: 'number' },
            fontSize: { type: 'number' },
            color: { type: 'string' },
            stroke_width: { type: 'number' },
            displayMode: { type: 'boolean' },
            align: { type: 'string', enum: [...LATEX_ALIGN] },
          },
          required: ['id', 'type'],
        },
      },
    },
    required: ['batch_id', 'elements'],
  },
};

export const SEMANTIC_DRAW_TOOL_DEFINITION = {
  type: 'function' as const,
  name: 'emit_semantic_batch',
  description:
    'Emit semantic whiteboard intent using template-driven layout. Prefer this tool for most diagrams and derivations.',
  // Keep non-strict tool JSON schema here; semantic strictness is enforced server-side via Zod.
  // OpenAI strict mode requires every object property to be required, which conflicts with optional fields.
  strict: false,
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      batch_id: { type: 'string' },
      style_preset: {
        type: 'string',
        enum: [...STYLE_PRESETS],
      },
      template: {
        type: 'string',
        enum: [...TEMPLATES],
      },
      intent: {
        type: 'string',
        enum: [...INTENTS],
      },
      blocks: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string' },
            kind: { type: 'string', enum: [...BLOCK_KINDS] },
            region_hint: {
              type: 'string',
              enum: [...REGION_HINTS],
            },
            title: { type: 'string' },
            align: { type: 'string', enum: [...EQUATION_ALIGN] },
            text: { type: 'string' },
            lines: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  id: { type: 'string' },
                  tex: { type: 'string' },
                  displayMode: { type: 'boolean' },
                  role: { type: 'string', enum: [...EQUATION_ROLES] },
                },
                required: ['id', 'tex'],
              },
            },
            axes: {
              type: 'object',
              additionalProperties: false,
              properties: { x_label: { type: 'string' }, y_label: { type: 'string' } },
              required: ['x_label', 'y_label'],
            },
            shapes: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  id: { type: 'string' },
                  type: { type: 'string', enum: [...PANEL_SHAPE_TYPES] },
                  label: { type: 'string' },
                  relative_pose: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      x: { type: 'number' },
                      y: { type: 'number' },
                      w: { type: 'number' },
                      h: { type: 'number' },
                      rotation_deg: { type: 'number' },
                    },
                    required: ['x', 'y'],
                  },
                },
                required: ['id', 'type'],
              },
            },
            captions: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  id: { type: 'string' },
                  text: { type: 'string' },
                  anchor: { type: 'string', enum: [...CAPTION_ANCHORS] },
                },
                required: ['id', 'text', 'anchor'],
              },
            },
          },
          required: ['id', 'kind'],
        },
      },
      relations: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string' },
            type: { type: 'string', enum: [...RELATION_TYPES] },
            from_block_id: { type: 'string' },
            to_block_id: { type: 'string' },
            from_anchor: { type: 'string' },
            to_anchor: { type: 'string' },
            label: { type: 'string' },
          },
          required: ['id', 'type', 'from_block_id', 'to_block_id'],
        },
      },
    },
    required: ['batch_id', 'template', 'blocks'],
  },
};

export const GRAPH_SCRIPT_TOOL_DEFINITION = {
  type: 'function' as const,
  name: 'emit_graph_script',
  description:
    'Emit a text-based graph/drawing script. Use when you want to describe panels, shapes, equations, captions, and connections in rich textual form.',
  strict: false,
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      batch_id: { type: 'string' },
      style_preset: {
        type: 'string',
        enum: [...STYLE_PRESETS],
      },
      template: {
        type: 'string',
        enum: [...TEMPLATES],
      },
      intent: {
        type: 'string',
        enum: [...INTENTS],
      },
      script: { type: 'string' },
    },
    required: ['batch_id', 'script'],
  },
};

export const AGENT_SYSTEM_PROMPT = `You are an interactive teaching agent for a chat + whiteboard product.

Rules:
- You may stream normal assistant text.
- Prefer emit_semantic_batch for whiteboard output. Use emit_draw_batch only if precise low-level geometry is essential.
- You can alternate text and draw multiple times in a single turn.
- Prefer incremental batches: for long derivations, emit 1-3 equations or one small visual step per batch.
- Describe WHAT to draw semantically, not brittle absolute placements.
- Use template as a lightweight layout hint only; do not rely on any hardcoded situation template.
- Prefer freeform_semantic unless you specifically want a vertical-derivation or two-panel emphasis.
- Whiteboard is a visual aid, not a transcript: keep it sparse and diagram-first.
- Keep whiteboard text concise (titles, labels, key equations). Do not dump long chat paragraphs.
- Per semantic batch budget:
  - at most 2 diagram panels
  - at most 1 equation_stack
  - at most 5 equation lines
  - captions should be short labels (prefer <= 6 words)
- Put full step-by-step prose in chat, not on the whiteboard.
- Respect current whiteboard state context provided in a system message for this turn.
- Unless user asks to rewrite existing regions, extend content into suggested next regions.
- Ensure semantic blocks have clear reading order and avoid intended overlap.
- In assistant chat text, wrap math using \\(...\\) for inline and \\[...\\] for block expressions.
- Never emit bare TeX commands in plain prose. Every formula token (for example \\frac, \\sqrt, \\neq, superscripts) must be inside \\(...\\) or \\[...\\].
- If a line is primarily an equation, format it as a dedicated block expression using \\[...\\].
- Use normal TeX commands with a single backslash (example: \\frac{a}{b}, not \\\\frac{a}{b}).
- For semantic batches, include blocks + relations that match teaching intent.
- For rich textual diagram authoring, you may use emit_graph_script with this line-oriented DSL:
  - graph id=<id> region=<left|right|center|auto> title="..." axes=<xLabel>,<yLabel>   (alias: panel)
  - node id=<id> graph=<graphId> shape=<rect|parallelogram|line|arrow|box|vector> at=<x,y> size=<w,h> row=<n> col=<n> rot=<deg> label="..."   (alias: shape)
  - edge id=<id> type=<maps_to|explains|derived_from|points_to> from=<ref> to=<ref> label="..."   (aliases: connect/link/arrow)
  - ref forms:
    - panel.shape.anchor  (example: left.cell.right)
    - panel.shape         (defaults to center)
    - shape.anchor with graph=<graphId> on line
    - panel (uses panel center)
  - caption id=<id> panel=<panelId> anchor=<top|bottom|left|right|center> text="..."   (aliases: label/text)
  - equation id=<id> region=<left|right|center|bottom|auto> tex="..." display=<true|false>
  - note id=<id> region=<left|right|center|bottom|auto> text="..."   (alias: legend)
  - set template=<...> style=<...> intent=<...> to configure defaults inside script
- For legacy draw batches, always provide valid numeric coordinates and dimensions.
- Do not use null for required tool fields.
- Never output markdown code fences for drawing instructions.`;
