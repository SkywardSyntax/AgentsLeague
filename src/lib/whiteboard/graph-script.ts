import type {
  RelativePose,
  SemanticBatch,
  SemanticCaptionBlock,
  SemanticDiagramPanelBlock,
  SemanticEquationStackBlock,
  SemanticRelation,
  StylePreset,
} from '@/types/agent';

type GraphScriptTemplate = SemanticBatch['template'];
type GraphScriptIntent = SemanticBatch['intent'];
type GraphShapeType = 'rect' | 'parallelogram' | 'line' | 'arrow' | 'diamond' | 'circle' | 'ellipse' | 'hexagon' | 'triangle';

interface ParseLineResult {
  command: string;
  kv: Record<string, string>;
  positional: string[];
}

interface AnchorRefParseContext {
  fallbackPanelId?: string;
  shapeToPanel: Map<string, string>;
  knownPanels: Set<string>;
}

interface ParsedAnchorRef {
  blockId: string;
  anchorId: string;
}

const TEMPLATE_SET = new Set<GraphScriptTemplate>([
  'equation_derivation_vertical',
  'jacobian_mapping_2panel',
  'freeform_semantic',
]);
const INTENT_SET = new Set<NonNullable<GraphScriptIntent>>(['teach', 'derive', 'compare', 'summarize']);
const STYLE_SET = new Set<StylePreset>(['clean_pen_sketch', 'rough_sketch', 'blueprint_neat']);
const PANEL_REGION_SET = new Set(['left', 'right', 'center', 'auto']);
const EQUATION_REGION_SET = new Set(['left', 'right', 'center', 'bottom', 'auto']);
const CAPTION_REGION_SET = new Set(['bottom', 'center', 'auto']);
const CAPTION_ANCHOR_SET = new Set(['top', 'bottom', 'left', 'right', 'center']);
const MAX_LABEL_LENGTH = 500;
const RELATION_TYPE_SET = new Set(['maps_to', 'explains', 'derived_from', 'points_to']);
const COMMAND_PANEL_SET = new Set(['panel', 'graph', 'canvas']);
const COMMAND_SHAPE_SET = new Set(['shape', 'node', 'item']);
const COMMAND_CONNECT_SET = new Set(['connect', 'edge', 'link', 'arrow']);
const COMMAND_CAPTION_SET = new Set(['caption', 'label', 'text']);
const COMMAND_EQUATION_SET = new Set(['equation', 'eq', 'math']);
const COMMAND_NOTE_SET = new Set(['note', 'legend']);
const COMMAND_SET_SET = new Set(['set', 'config', 'settings']);
const SHAPE_SYNONYM_MAP: Record<string, GraphShapeType> = {
  rect: 'rect',
  rectangle: 'rect',
  box: 'rect',
  node: 'rect',
  card: 'rect',
  parallelogram: 'parallelogram',
  skew: 'parallelogram',
  tilted_box: 'parallelogram',
  line: 'line',
  segment: 'line',
  vector: 'line',
  arrow: 'arrow',
  diamond: 'diamond',
  rhombus: 'diamond',
  decision: 'diamond',
  circle: 'circle',
  dot: 'circle',
  bubble: 'circle',
  ellipse: 'ellipse',
  oval: 'ellipse',
  hexagon: 'hexagon',
  hex: 'hexagon',
  triangle: 'triangle',
  tri: 'triangle',
};
const ANCHOR_ALIAS_MAP: Record<string, string> = {
  centre: 'center',
  middle: 'center',
  c: 'center',
  l: 'left',
  r: 'right',
  t: 'top',
  b: 'bottom',
  nw: 'top-left',
  ne: 'top-right',
  sw: 'bottom-left',
  se: 'bottom-right',
};

import { clamp } from './geometry';

function toNumber(input: string | undefined): number | null {
  if (!input) return null;
  const parsed = Number(input);
  return Number.isFinite(parsed) ? parsed : null;
}

function toInt(input: string | undefined): number | null {
  const parsed = toNumber(input);
  if (parsed == null) return null;
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function truncateLabel(text: string, warnings: string[], context: string): string {
  if (text.length <= MAX_LABEL_LENGTH) return text;
  warnings.push(`${context}: label truncated from ${text.length} to ${MAX_LABEL_LENGTH} chars`);
  return text.slice(0, MAX_LABEL_LENGTH);
}

function stripComments(line: string): string {
  let result = '';
  let quote: "'" | '"' | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    const next = line[i + 1] ?? '';

    if (!quote && ch === '/' && next === '/') break;
    if (!quote && ch === '#') break;

    if (ch === '"' || ch === "'") {
      if (!quote) quote = ch;
      else if (quote === ch && line[i - 1] !== '\\') quote = null;
    }
    result += ch;
  }
  return result.trim();
}

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: "'" | '"' | null = null;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    const isWhitespace = /\s/.test(ch);

    if (!quote && isWhitespace) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      if (!quote) {
        quote = ch;
        current += ch;
        continue;
      }
      if (quote === ch && input[i - 1] !== '\\') {
        quote = null;
        current += ch;
        continue;
      }
    }

    current += ch;
  }

  if (current.length > 0) tokens.push(current);
  return tokens;
}

function unquote(value: string): string {
  if (value.length < 2) return value;
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1).replace(/\\(["'])/g, '$1');
  }
  return value;
}

function parseLine(line: string): ParseLineResult | null {
  const clean = stripComments(line);
  if (!clean) return null;
  const tokens = tokenize(clean);
  if (tokens.length === 0) return null;

  const command = tokens[0]!.toLowerCase();
  const kv: Record<string, string> = {};
  const positional: string[] = [];

  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i]!;
    const eq = token.indexOf('=');
    if (eq > 0) {
      const key = token.slice(0, eq).trim().toLowerCase();
      const value = unquote(token.slice(eq + 1).trim());
      if (key) kv[key] = value;
      continue;
    }
    positional.push(unquote(token));
  }

  return { command, kv, positional };
}

function parseAxes(value: string | undefined): { x_label: string; y_label: string } | null {
  if (!value) return null;
  const parts = value.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  return { x_label: parts[0]!, y_label: parts[1]! };
}

function parsePair(value: string | undefined): { first: number; second: number } | null {
  if (!value) return null;
  const parts = value.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const first = Number(parts[0]);
  const second = Number(parts[1]);
  if (!Number.isFinite(first) || !Number.isFinite(second)) return null;
  return { first, second };
}

function normalizeAnchorName(input: string | undefined): string {
  const raw = (input ?? 'center').trim().toLowerCase();
  return ANCHOR_ALIAS_MAP[raw] ?? raw;
}

function parseShapeType(rawType: string | undefined): GraphShapeType | null {
  if (!rawType) return null;
  const normalized = rawType.trim().toLowerCase();
  return SHAPE_SYNONYM_MAP[normalized] ?? null;
}

function buildShapeAnchorId(panelId: string, shapeId: string, anchor: string): string {
  return `${panelId}-${shapeId}-${anchor}`;
}

function parseAnchorRef(value: string | undefined, context: AnchorRefParseContext): ParsedAnchorRef | null {
  if (!value) return null;
  const token = value.trim();
  if (!token) return null;

  if (context.knownPanels.has(token)) {
    return {
      blockId: token,
      anchorId: `${token}-panel-center`,
    };
  }

  const parts = token.split('.').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;

  if (parts.length >= 3) {
    const panelId = parts[0]!;
    const shapeId = parts[1]!;
    const anchor = normalizeAnchorName(parts.slice(2).join('-'));
    return {
      blockId: panelId,
      anchorId: buildShapeAnchorId(panelId, shapeId, anchor),
    };
  }

  if (parts.length === 2) {
    const first = parts[0]!;
    const second = parts[1]!;

    if (context.knownPanels.has(first)) {
      return {
        blockId: first,
        anchorId: buildShapeAnchorId(first, second, 'center'),
      };
    }

    const panelFromShape = context.shapeToPanel.get(first);
    const fallbackPanel = panelFromShape ?? context.fallbackPanelId;
    if (fallbackPanel) {
      return {
        blockId: fallbackPanel,
        anchorId: buildShapeAnchorId(fallbackPanel, first, normalizeAnchorName(second)),
      };
    }

    return null;
  }

  const single = parts[0]!;
  if (context.knownPanels.has(single)) {
    return {
      blockId: single,
      anchorId: `${single}-panel-center`,
    };
  }

  const inferredPanel = context.shapeToPanel.get(single) ?? context.fallbackPanelId;
  if (!inferredPanel) return null;
  return {
    blockId: inferredPanel,
    anchorId: buildShapeAnchorId(inferredPanel, single, 'center'),
  };
}

function autoNodePose(nodeIndex: number): RelativePose {
  const cols = 3;
  const col = nodeIndex % cols;
  const row = Math.floor(nodeIndex / cols);
  return {
    x: clamp(0.24 + col * 0.27, 0.14, 0.9),
    y: clamp(0.24 + row * 0.25, 0.18, 0.88),
    w: 0.22,
    h: 0.16,
  };
}

function poseFromRowCol(rowIndex: number, colIndex: number): RelativePose {
  return {
    x: clamp(0.24 + colIndex * 0.27, 0.14, 0.9),
    y: clamp(0.24 + rowIndex * 0.25, 0.18, 0.88),
    w: 0.22,
    h: 0.16,
  };
}

function parseShapePose(
  kv: Record<string, string>,
  shapeType: GraphShapeType,
  autoPose: RelativePose | null,
): RelativePose | undefined {
  const at = parsePair(kv.at ?? kv.pos);
  const size = parsePair(kv.size);
  const x = toNumber(kv.x) ?? at?.first ?? null;
  const y = toNumber(kv.y) ?? at?.second ?? null;
  const w = toNumber(kv.w) ?? toNumber(kv.width) ?? size?.first ?? null;
  const h = toNumber(kv.h) ?? toNumber(kv.height) ?? size?.second ?? null;
  const rot = toNumber(kv.rot ?? kv.rotation ?? kv.rotation_deg);

  const row = toInt(kv.row);
  const col = toInt(kv.col);
  let rowColPose: RelativePose | null = null;
  if (row != null || col != null) {
    const rowIndex = clamp((row ?? 1) - 1, 0, 12);
    const colIndex = clamp((col ?? 1) - 1, 0, 12);
    rowColPose = poseFromRowCol(rowIndex, colIndex);
  }

  const defaultPose =
    rowColPose ??
    autoPose ??
    (shapeType === 'line' || shapeType === 'arrow'
      ? { x: 0.56, y: 0.52, w: 0.28, h: 0.02 }
      : { x: 0.56, y: 0.52, w: 0.24, h: 0.18 });

  return {
    x: clamp(x ?? defaultPose.x, 0, 1),
    y: clamp(y ?? defaultPose.y, 0, 1),
    ...(w == null
      ? defaultPose.w == null
        ? {}
        : { w: clamp(defaultPose.w, 0, 1) }
      : { w: clamp(w, 0, 1) }),
    ...(h == null
      ? defaultPose.h == null
        ? {}
        : { h: clamp(defaultPose.h, 0, 1) }
      : { h: clamp(h, 0, 1) }),
    ...(rot == null ? {} : { rotation_deg: clamp(rot, -360, 360) }),
  };
}

function ensurePanel(
  panels: Map<string, SemanticDiagramPanelBlock>,
  panelOrder: string[],
  panelId: string,
): SemanticDiagramPanelBlock {
  const existing = panels.get(panelId);
  if (existing) return existing;

  const created: SemanticDiagramPanelBlock = {
    id: panelId,
    kind: 'diagram_panel',
    region_hint: 'auto',
    shapes: [],
    captions: [],
  };
  panels.set(panelId, created);
  panelOrder.push(panelId);
  return created;
}

export function parseGraphScriptToSemanticBatch(input: unknown): {
  semanticBatch: SemanticBatch | null;
  warnings: string[];
} {
  const warnings: string[] = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { semanticBatch: null, warnings: ['Graph script payload must be an object'] };
  }

  const payload = input as Record<string, unknown>;
  const batch_id = typeof payload.batch_id === 'string' && payload.batch_id.trim().length > 0
    ? payload.batch_id.trim()
    : `graph-${Date.now()}`;
  const rawScript = typeof payload.script === 'string' ? payload.script : '';
  if (rawScript.length > 50_000) {
    return { semanticBatch: null, warnings: ['Script exceeds maximum length'] };
  }
  // Strip control characters (keep \t, \n, \r)
  const script = rawScript.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  if (!script.trim()) {
    return { semanticBatch: null, warnings: ['Graph script is empty'] };
  }

  let stylePreset =
    typeof payload.style_preset === 'string' && STYLE_SET.has(payload.style_preset as StylePreset)
      ? (payload.style_preset as StylePreset)
      : undefined;
  let explicitTemplate =
    typeof payload.template === 'string' && TEMPLATE_SET.has(payload.template as GraphScriptTemplate)
      ? (payload.template as GraphScriptTemplate)
      : undefined;
  let intent =
    typeof payload.intent === 'string' && INTENT_SET.has(payload.intent as NonNullable<GraphScriptIntent>)
      ? (payload.intent as GraphScriptIntent)
      : undefined;

  const panels = new Map<string, SemanticDiagramPanelBlock>();
  const panelOrder: string[] = [];
  const captions: SemanticCaptionBlock[] = [];
  const equationStacks = new Map<string, SemanticEquationStackBlock>();
  const equationOrder: string[] = [];
  const relations: SemanticRelation[] = [];
  const panelNodeCounts = new Map<string, number>();
  const shapeToPanel = new Map<string, string>();
  const shapeIdCounts = new Map<string, number>();

  const lines = script.split(/\r?\n/);
  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const parsed = parseLine(lines[lineIdx]!);
    if (!parsed) continue;
    const { command, kv, positional } = parsed;
    const id = kv.id ?? positional[0];

    if (COMMAND_SET_SET.has(command)) {
      const template = kv.template ?? kv.layout;
      if (template && TEMPLATE_SET.has(template as GraphScriptTemplate)) {
        explicitTemplate = template as GraphScriptTemplate;
      }
      const inlineStyle = kv.style ?? kv.style_preset;
      if (inlineStyle && STYLE_SET.has(inlineStyle as StylePreset)) {
        stylePreset = inlineStyle as StylePreset;
      }
      const inlineIntent = kv.intent;
      if (inlineIntent && INTENT_SET.has(inlineIntent as NonNullable<GraphScriptIntent>)) {
        intent = inlineIntent as GraphScriptIntent;
      }
      continue;
    }

    if (command === 'template' || command === 'layout') {
      const inlineTemplate = kv.value ?? positional[0];
      if (inlineTemplate && TEMPLATE_SET.has(inlineTemplate as GraphScriptTemplate)) {
        explicitTemplate = inlineTemplate as GraphScriptTemplate;
      }
      continue;
    }

    if (command === 'style') {
      const inlineStyle = kv.value ?? positional[0];
      if (inlineStyle && STYLE_SET.has(inlineStyle as StylePreset)) {
        stylePreset = inlineStyle as StylePreset;
      }
      continue;
    }

    if (command === 'intent') {
      const inlineIntent = kv.value ?? positional[0];
      if (inlineIntent && INTENT_SET.has(inlineIntent as NonNullable<GraphScriptIntent>)) {
        intent = inlineIntent as GraphScriptIntent;
      }
      continue;
    }

    if (COMMAND_PANEL_SET.has(command)) {
      if (!id) {
        warnings.push(`line ${lineIdx + 1}: panel/graph requires id`);
        continue;
      }
      const panel = ensurePanel(panels, panelOrder, id);
      const title = kv.title ?? kv.name ?? (positional.length > 1 ? positional.slice(1).join(' ') : undefined);
      if (title) panel.title = title;
      const region = kv.region ?? kv.lane;
      if (region && PANEL_REGION_SET.has(region)) {
        panel.region_hint = region as SemanticDiagramPanelBlock['region_hint'];
      }

      const axes = parseAxes(kv.axes) ??
        ((kv.x && kv.y) ? { x_label: kv.x, y_label: kv.y } : null) ??
        ((kv.xlabel && kv.ylabel) ? { x_label: kv.xlabel, y_label: kv.ylabel } : null);
      if (axes) panel.axes = axes;
      continue;
    }

    if (COMMAND_SHAPE_SET.has(command)) {
      const panelId = kv.panel ?? kv.graph ?? positional[0];
      let shapeId = kv.id ?? positional[1] ?? `${command}-${lineIdx + 1}`;
      const rawType = kv.type ?? kv.shape ?? positional[2] ?? (command === 'node' ? 'rect' : '');
      const shapeType = parseShapeType(rawType);
      if (!panelId || !shapeType) {
        warnings.push(`line ${lineIdx + 1}: ${command} requires panel/graph + valid type/shape`);
        continue;
      }

      const panel = ensurePanel(panels, panelOrder, panelId);

      // Deterministic rename for duplicate shape IDs within the same panel
      const existingPanel = shapeToPanel.get(shapeId);
      if (existingPanel === panelId) {
        const count = (shapeIdCounts.get(shapeId) ?? 1) + 1;
        shapeIdCounts.set(shapeId, count);
        const newId = `${shapeId}-${count}`;
        warnings.push(`line ${lineIdx + 1}: duplicate shape id "${shapeId}" in panel "${panelId}"; renamed to "${newId}"`);
        shapeId = newId;
      } else if (existingPanel && existingPanel !== panelId) {
        warnings.push(`line ${lineIdx + 1}: duplicate shape id '${shapeId}' across panels; latest one wins`);
      }

      const autoIndex = panelNodeCounts.get(panelId) ?? 0;
      panelNodeCounts.set(panelId, autoIndex + 1);
      const autoPose = command === 'node' ? autoNodePose(autoIndex) : null;
      const pose = parseShapePose(kv, shapeType, autoPose);

      panel.shapes = panel.shapes ?? [];
      panel.shapes.push({
        id: shapeId,
        type: shapeType,
        ...(kv.label ?? kv.text ? { label: truncateLabel(kv.label ?? kv.text!, warnings, `line ${lineIdx + 1}`) } : {}),
        ...(pose ? { relative_pose: pose } : {}),
      });
      shapeToPanel.set(shapeId, panelId);
      continue;
    }

    if (COMMAND_CAPTION_SET.has(command)) {
      const rawText = kv.text ?? kv.label ?? (positional.length > 1 ? positional.slice(1).join(' ') : positional[0]);
      if (!rawText) {
        warnings.push(`line ${lineIdx + 1}: ${command} requires text`);
        continue;
      }
      const text = truncateLabel(rawText, warnings, `line ${lineIdx + 1}`);
      const capId = kv.id ?? `${command}-${lineIdx + 1}`;
      const panelId = kv.panel ?? kv.graph ?? positional[0];

      if (panelId && panels.has(panelId)) {
        const panel = ensurePanel(panels, panelOrder, panelId);
        const anchorRaw = kv.anchor ?? kv.at ?? 'bottom';
        const anchor = CAPTION_ANCHOR_SET.has(anchorRaw) ? anchorRaw : 'bottom';
        panel.captions = panel.captions ?? [];
        panel.captions.push({ id: capId, text, anchor: anchor as 'top' | 'bottom' | 'left' | 'right' | 'center' });
      } else {
        const region = kv.region && CAPTION_REGION_SET.has(kv.region) ? kv.region : 'auto';
        captions.push({ id: capId, kind: 'caption', text, region_hint: region as 'bottom' | 'center' | 'auto' });
      }
      continue;
    }

    if (COMMAND_EQUATION_SET.has(command)) {
      const tex = kv.tex ?? kv.latex ?? kv.math ?? positional.slice(1).join(' ');
      if (!tex) {
        warnings.push(`line ${lineIdx + 1}: ${command} requires tex`);
        continue;
      }
      const region = kv.region && EQUATION_REGION_SET.has(kv.region) ? kv.region : 'auto';
      const stackKey = `eq-${region}`;
      const lineId = kv.id ?? `eq-line-${lineIdx + 1}`;

      if (!equationStacks.has(stackKey)) {
        equationStacks.set(stackKey, {
          id: stackKey,
          kind: 'equation_stack',
          region_hint: region as SemanticEquationStackBlock['region_hint'],
          lines: [],
          align: region === 'center' ? 'center' : 'left',
        });
        equationOrder.push(stackKey);
      }
      const stack = equationStacks.get(stackKey);
      if (!stack) continue;
      const displayArg = kv.display ?? kv.displaymode;
      stack.lines.push({
        id: lineId,
        tex,
        displayMode: displayArg ? displayArg !== 'false' : true,
        ...(kv.role ? { role: kv.role as 'step' | 'result' | 'note' } : {}),
      });
      continue;
    }

    if (COMMAND_NOTE_SET.has(command)) {
      const rawNoteText = kv.text ?? positional.slice(1).join(' ');
      if (!rawNoteText) {
        warnings.push(`line ${lineIdx + 1}: ${command} requires text`);
        continue;
      }
      const text = truncateLabel(rawNoteText, warnings, `line ${lineIdx + 1}`);
      const region = kv.region && CAPTION_REGION_SET.has(kv.region) ? kv.region : 'auto';
      captions.push({
        id: kv.id ?? `${command}-${lineIdx + 1}`,
        kind: 'caption',
        text,
        region_hint: region as 'bottom' | 'center' | 'auto',
      });
      continue;
    }

    if (COMMAND_CONNECT_SET.has(command)) {
      const fallbackPanelId = kv.panel ?? kv.graph;
      const fromRef = parseAnchorRef(kv.from ?? positional[0], {
        fallbackPanelId,
        shapeToPanel,
        knownPanels: new Set(panels.keys()),
      });
      const toRef = parseAnchorRef(kv.to ?? positional[1], {
        fallbackPanelId,
        shapeToPanel,
        knownPanels: new Set(panels.keys()),
      });
      if (!fromRef || !toRef) {
        warnings.push(`line ${lineIdx + 1}: ${command} requires resolvable from/to references`);
        continue;
      }
      const relationType = kv.type && RELATION_TYPE_SET.has(kv.type)
        ? kv.type
        : command === 'edge' || command === 'arrow' || command === 'link'
          ? 'points_to'
          : 'maps_to';
      relations.push({
        id: kv.id ?? `${command}-${lineIdx + 1}`,
        type: relationType as SemanticRelation['type'],
        from_block_id: fromRef.blockId,
        to_block_id: toRef.blockId,
        from_anchor: fromRef.anchorId,
        to_anchor: toRef.anchorId,
        ...(kv.label ? { label: truncateLabel(kv.label, warnings, `line ${lineIdx + 1}`) } : {}),
      });
      continue;
    }

    warnings.push(`line ${lineIdx + 1}: unsupported command '${command}'`);
  }

  const blocks = [
    ...panelOrder.map((panelId) => panels.get(panelId)).filter(
      (b): b is NonNullable<typeof b> => b != null,
    ),
    ...equationOrder.map((stackId) => equationStacks.get(stackId)).filter(
      (b): b is NonNullable<typeof b> => b != null,
    ),
    ...captions,
  ];

  if (blocks.length === 0) {
    return { semanticBatch: null, warnings: [...warnings, 'No drawable blocks were parsed from graph script'] };
  }

  let template: GraphScriptTemplate = explicitTemplate ?? 'freeform_semantic';
  if (!explicitTemplate) {
    if (panels.size >= 2 && relations.length > 0) template = 'jacobian_mapping_2panel';
    else if (equationStacks.size > 0 && panels.size === 0) template = 'equation_derivation_vertical';
  }

  return {
    semanticBatch: {
      batch_id,
      template,
      blocks,
      ...(stylePreset ? { style_preset: stylePreset } : {}),
      ...(intent ? { intent } : {}),
      ...(relations.length > 0 ? { relations } : {}),
    },
    warnings,
  };
}
