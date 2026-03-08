import type {
  DrawBatch,
  DrawElement,
  Point,
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
const COMMAND_PLOT_SET = new Set(['plot', 'curve']);
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
import { sampleFunction, tickMarksForRange } from './math-sampling';

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

// ---------------------------------------------------------------------------
// Safe math expression evaluator (no eval / new Function)
// ---------------------------------------------------------------------------

const EXPR_CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
};

const EXPR_FUNCTIONS: Record<string, (v: number) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  sqrt: Math.sqrt, abs: Math.abs, log: Math.log,
  ln: Math.log, log10: Math.log10, log2: Math.log2,
  exp: Math.exp, floor: Math.floor, ceil: Math.ceil,
  round: Math.round, sign: Math.sign,
};

const EXPR_FUNCTIONS_2ARG: Record<string, (a: number, b: number) => number> = {
  min: Math.min, max: Math.max, pow: Math.pow,
};

/** All supported function names (single + two-arg) for validation hints. */
export const SUPPORTED_FUNCTIONS = [
  ...Object.keys(EXPR_FUNCTIONS),
  ...Object.keys(EXPR_FUNCTIONS_2ARG),
] as const;

/** All supported constant names for validation hints. */
export const SUPPORTED_CONSTANTS = Object.keys(EXPR_CONSTANTS) as readonly string[];

type ExprNode =
  | { kind: 'number'; value: number }
  | { kind: 'var' }
  | { kind: 'var_y' }
  | { kind: 'unary'; op: '-'; arg: ExprNode }
  | { kind: 'binary'; op: '+' | '-' | '*' | '/' | '^'; left: ExprNode; right: ExprNode }
  | { kind: 'call'; fn: (v: number) => number; arg: ExprNode }
  | { kind: 'call2'; fn: (a: number, b: number) => number; left: ExprNode; right: ExprNode };

function tokenizeExpr(input: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i]!;
    if (/\s/.test(ch)) { i++; continue; }
    if ('+-*/^(),'.includes(ch)) { tokens.push(ch); i++; continue; }
    if (/[0-9.]/.test(ch)) {
      let num = '';
      while (i < input.length && /[0-9.]/.test(input[i]!)) { num += input[i]; i++; }
      tokens.push(num);
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let ident = '';
      while (i < input.length && /[a-zA-Z_0-9]/.test(input[i]!)) { ident += input[i]; i++; }
      tokens.push(ident);
      continue;
    }
    return [];
  }
  return tokens;
}

/**
 * Insert implicit multiplication tokens.
 *
 * Handles: `2x` → `2*x`, `2(` → `2*(`, `)x` → `)*x`,
 * `)(` → `)*(`, `x(` → `x*(` (when x is not a function name),
 * `pi x` → `pi*x`, `2pi` → `2*pi`.
 */
function insertImplicitMul(tokens: string[]): string[] {
  const result: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    result.push(tokens[i]!);
    if (i + 1 >= tokens.length) continue;
    const cur = tokens[i]!;
    const next = tokens[i + 1]!;
    const curIsNum = /^[0-9.]/.test(cur);
    const curIsIdent = /^[a-zA-Z_]/.test(cur);
    const curIsCloseParen = cur === ')';
    const nextIsNum = /^[0-9.]/.test(next);
    const nextIsIdent = /^[a-zA-Z_]/.test(next);
    const nextIsOpenParen = next === '(';

    const curIsIdentNotFunc = curIsIdent
      && !EXPR_FUNCTIONS[cur.toLowerCase()]
      && !EXPR_FUNCTIONS_2ARG[cur.toLowerCase()];

    // number followed by ident or '(' : 2x, 2sin(x), 2(x+1)
    if (curIsNum && (nextIsIdent || nextIsOpenParen)) { result.push('*'); continue; }
    // ')' followed by number, ident, or '(' : )(, )x, )2
    if (curIsCloseParen && (nextIsNum || nextIsIdent || nextIsOpenParen)) { result.push('*'); continue; }
    // ident (not function) followed by '(' : x(x+1)
    if (curIsIdentNotFunc && nextIsOpenParen) { result.push('*'); continue; }
    // ident (not function) followed by number: x2 → x*2
    if (curIsIdentNotFunc && nextIsNum) { result.push('*'); continue; }
    // constant followed by ident: pi x → pi*x
    if (curIsIdent && EXPR_CONSTANTS[cur.toLowerCase()] !== undefined && nextIsIdent) { result.push('*'); continue; }
  }
  return result;
}

function buildExprAST(tokens: string[]): ExprNode | null {
  let pos = 0;
  function peek(): string | undefined { return tokens[pos]; }
  function advance(): string { return tokens[pos++]!; }

  function parseAdditive(): ExprNode | null {
    let left = parseMultiplicative();
    if (!left) return null;
    while (peek() === '+' || peek() === '-') {
      const op = advance() as '+' | '-';
      const right = parseMultiplicative();
      if (!right) return null;
      left = { kind: 'binary', op, left, right };
    }
    return left;
  }

  function parseMultiplicative(): ExprNode | null {
    let left = parseUnary();
    if (!left) return null;
    while (peek() === '*' || peek() === '/') {
      const op = advance() as '*' | '/';
      const right = parseUnary();
      if (!right) return null;
      left = { kind: 'binary', op, left, right };
    }
    return left;
  }

  function parseUnary(): ExprNode | null {
    if (peek() === '-') {
      advance();
      const a = parseUnary();
      return a ? { kind: 'unary', op: '-', arg: a } : null;
    }
    if (peek() === '+') { advance(); return parseUnary(); }
    return parsePower();
  }

  function parsePower(): ExprNode | null {
    const base = parseCall();
    if (!base) return null;
    if (peek() === '^') {
      advance();
      const exponent = parseUnary();
      return exponent ? { kind: 'binary', op: '^', left: base, right: exponent } : null;
    }
    return base;
  }

  function parseCall(): ExprNode | null {
    const tok = peek();
    if (tok && /^[a-zA-Z_]/.test(tok)) {
      const lower = tok.toLowerCase();
      // Two-argument function: min(a,b), max(a,b), pow(a,b)
      const fn2 = EXPR_FUNCTIONS_2ARG[lower];
      if (fn2 !== undefined && tokens[pos + 1] === '(') {
        advance(); // ident
        advance(); // '('
        const arg1 = parseAdditive();
        if (!arg1 || peek() !== ',') return null;
        advance(); // ','
        const arg2 = parseAdditive();
        if (!arg2 || peek() !== ')') return null;
        advance(); // ')'
        return { kind: 'call2', fn: fn2, left: arg1, right: arg2 };
      }
      // Single-argument function
      const fn = EXPR_FUNCTIONS[lower];
      if (fn !== undefined && tokens[pos + 1] === '(') {
        advance(); // ident
        advance(); // '('
        const arg = parseAdditive();
        if (!arg || peek() !== ')') return null;
        advance(); // ')'
        return { kind: 'call', fn, arg };
      }
    }
    return parsePrimary();
  }

  function parsePrimary(): ExprNode | null {
    const tok = peek();
    if (!tok) return null;
    if (/^[0-9]/.test(tok) || (tok.startsWith('.') && tok.length > 1)) {
      advance();
      const v = Number(tok);
      return Number.isFinite(v) ? { kind: 'number', value: v } : null;
    }
    if (tok === '(') {
      advance();
      const inner = parseAdditive();
      if (!inner || peek() !== ')') return null;
      advance();
      return inner;
    }
    const lower = tok.toLowerCase();
    if (lower === 'x' || lower === 't') { advance(); return { kind: 'var' }; }
    if (lower === 'y') { advance(); return { kind: 'var_y' }; }
    const c = EXPR_CONSTANTS[lower];
    if (c !== undefined) { advance(); return { kind: 'number', value: c }; }
    return null;
  }

  const result = parseAdditive();
  return result && pos === tokens.length ? result : null;
}

const MAX_EXPR_DEPTH = 100;

function evalExprNode(node: ExprNode, x: number, depth = 0): number {
  if (depth > MAX_EXPR_DEPTH) throw new Error('Expression depth limit exceeded');
  switch (node.kind) {
    case 'number': return node.value;
    case 'var': return x;
    case 'var_y': return x; // single-variable mode: y maps to x
    case 'unary': return -evalExprNode(node.arg, x, depth + 1);
    case 'call': return node.fn(evalExprNode(node.arg, x, depth + 1));
    case 'call2': return node.fn(evalExprNode(node.left, x, depth + 1), evalExprNode(node.right, x, depth + 1));
    case 'binary': {
      const l = evalExprNode(node.left, x, depth + 1);
      const r = evalExprNode(node.right, x, depth + 1);
      switch (node.op) {
        case '+': return l + r;
        case '-': return l - r;
        case '*': return l * r;
        case '/': return l / r;
        case '^': return Math.pow(l, r);
      }
    }
  }
}

/**
 * Validate a math expression string without evaluating it.
 *
 * Returns `{ valid: true }` if the expression can be parsed, or
 * `{ valid: false, error: string }` with a descriptive message.
 */
export function validateExpression(expr: string): { valid: boolean; error?: string } {
  if (!expr || !expr.trim()) {
    return { valid: false, error: 'Expression is empty' };
  }
  const trimmed = expr.trim();

  // Check for disallowed characters
  const disallowed = trimmed.match(/[^a-zA-Z0-9_\s+\-*/^().,%]/);
  if (disallowed) {
    return { valid: false, error: `Unexpected character '${disallowed[0]}' in expression` };
  }

  const lower = trimmed.toLowerCase();
  // Bare function name is OK
  if (EXPR_FUNCTIONS[lower] && !trimmed.includes('(')) {
    return { valid: true };
  }

  const tokens = tokenizeExpr(trimmed);
  if (tokens.length === 0) {
    return { valid: false, error: 'Expression contains invalid characters' };
  }

  // Check for unknown identifiers
  for (const tok of tokens) {
    if (/^[a-zA-Z_]/.test(tok)) {
      const l = tok.toLowerCase();
      if (l !== 'x' && l !== 't' && l !== 'y'
        && EXPR_CONSTANTS[l] === undefined
        && EXPR_FUNCTIONS[l] === undefined
        && EXPR_FUNCTIONS_2ARG[l] === undefined) {
        return { valid: false, error: `Unknown identifier '${tok}'. Supported functions: ${SUPPORTED_FUNCTIONS.join(', ')}` };
      }
    }
  }

  // Check balanced parentheses
  let depth = 0;
  for (const tok of tokens) {
    if (tok === '(') depth++;
    if (tok === ')') depth--;
    if (depth < 0) return { valid: false, error: 'Unmatched closing parenthesis' };
  }
  if (depth !== 0) return { valid: false, error: 'Unmatched opening parenthesis' };

  const withImplicitMul = insertImplicitMul(tokens);
  const ast = buildExprAST(withImplicitMul);
  if (!ast) {
    return { valid: false, error: 'Could not parse expression — check syntax (operators, parentheses, function arguments)' };
  }

  return { valid: true };
}

/**
 * Parse a math expression string into a callable function of x.
 *
 * Supports: `+`, `-`, `*`, `/`, `^`, parentheses, constants (`pi`, `e`),
 * standard functions (`sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `sinh`,
 * `cosh`, `tanh`, `sqrt`, `abs`, `log`, `exp`, `floor`, `ceil`, `round`, `sign`),
 * two-argument functions (`min`, `max`, `pow`), and implicit multiplication
 * (`2x` → `2*x`, `2(x+1)` → `2*(x+1)`).
 *
 * Uses a safe recursive-descent parser — no `eval()`.
 */
export function parseMathExpression(expr: string): ((x: number) => number) | null {
  const trimmed = expr.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  // Convenience: bare function name (e.g., "sin") → fn(x)
  const bareFn = EXPR_FUNCTIONS[lower];
  if (bareFn && !trimmed.includes('(')) {
    return (x: number) => bareFn(x);
  }
  const tokens = tokenizeExpr(trimmed);
  if (tokens.length === 0) return null;
  const withImplicitMul = insertImplicitMul(tokens);
  const ast = buildExprAST(withImplicitMul);
  if (!ast) return null;
  return (x: number) => {
    try {
      return evalExprNode(ast, x);
    } catch {
      return NaN;
    }
  };
}

// ---------------------------------------------------------------------------
// Two-variable expression evaluator for slope fields and vector fields
// ---------------------------------------------------------------------------

function evalExprNode2Var(node: ExprNode, x: number, y: number, depth = 0): number {
  if (depth > MAX_EXPR_DEPTH) throw new Error('Expression depth limit exceeded');
  switch (node.kind) {
    case 'number': return node.value;
    case 'var': return x;
    case 'var_y': return y;
    case 'unary': return -evalExprNode2Var(node.arg, x, y, depth + 1);
    case 'call': return node.fn(evalExprNode2Var(node.arg, x, y, depth + 1));
    case 'call2': return node.fn(evalExprNode2Var(node.left, x, y, depth + 1), evalExprNode2Var(node.right, x, y, depth + 1));
    case 'binary': {
      const l = evalExprNode2Var(node.left, x, y, depth + 1);
      const r = evalExprNode2Var(node.right, x, y, depth + 1);
      switch (node.op) {
        case '+': return l + r;
        case '-': return l - r;
        case '*': return l * r;
        case '/': return l / r;
        case '^': return Math.pow(l, r);
      }
    }
  }
}

/**
 * Parse a math expression with two variables (x, y) into a callable function.
 * Used for slope fields (dy/dx = f(x,y)) and vector field components.
 */
export function parseMathExpression2Var(expr: string): ((x: number, y: number) => number) | null {
  const trimmed = expr.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  const bareFn = EXPR_FUNCTIONS[lower];
  if (bareFn && !trimmed.includes('(')) {
    return (x: number) => bareFn(x);
  }
  const tokens = tokenizeExpr(trimmed);
  if (tokens.length === 0) return null;
  const withImplicitMul = insertImplicitMul(tokens);
  const ast = buildExprAST(withImplicitMul);
  if (!ast) return null;
  return (x: number, y: number) => {
    try {
      return evalExprNode2Var(ast, x, y);
    } catch {
      return NaN;
    }
  };
}

// ---------------------------------------------------------------------------
// MathScene – high-level math scene descriptions → DrawBatch
// ---------------------------------------------------------------------------

export interface FunctionDef {
  label: string;
  fn: (x: number) => number;
  color?: string;
}

export interface MathSceneFunctionPlot {
  type: 'function_plot';
  functions: FunctionDef[];
  xRange: [number, number];
  yRange?: [number, number];
  origin?: { x: number; y: number };
  width?: number;
  height?: number;
  xLabel?: string;
  yLabel?: string;
  gridlines?: boolean;
  steps?: number;
}

export interface GeometryShape {
  kind: 'circle' | 'line_segment' | 'polygon' | 'point';
  points: Point[];
  label?: string;
  color?: string;
  radius?: number;
}

export interface MathSceneGeometry {
  type: 'geometry';
  shapes: GeometryShape[];
  origin?: { x: number; y: number };
  width?: number;
  height?: number;
}

export interface AlgebraEquation {
  tex: string;
  role?: 'step' | 'result' | 'note';
}

export interface MathSceneAlgebra {
  type: 'algebra';
  equations: AlgebraEquation[];
  origin?: { x: number; y: number };
}

export type MathScene = MathSceneFunctionPlot | MathSceneGeometry | MathSceneAlgebra;

const DEFAULT_PLOT_COLORS = ['#2563eb', '#dc2626', '#059669', '#d97706', '#7c3aed', '#db2777'];
const PLOT_DEFAULTS = { ox: 80, oy: 60, w: 560, h: 380, steps: 200 } as const;

function autoYRange(fns: FunctionDef[], xMin: number, xMax: number, steps: number): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  const dx = (xMax - xMin) / steps;
  for (const { fn } of fns) {
    for (let i = 0; i <= steps; i++) {
      const y = fn(xMin + i * dx);
      if (Number.isFinite(y)) {
        if (y < lo) lo = y;
        if (y > hi) hi = y;
      }
    }
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo >= hi) return [-10, 10];
  const pad = (hi - lo) * 0.1 || 1;
  return [lo - pad, hi + pad];
}

function renderFunctionPlotScene(scene: MathSceneFunctionPlot): DrawBatch {
  const ox = scene.origin?.x ?? PLOT_DEFAULTS.ox;
  const oy = scene.origin?.y ?? PLOT_DEFAULTS.oy;
  const w = scene.width ?? PLOT_DEFAULTS.w;
  const h = scene.height ?? PLOT_DEFAULTS.h;
  const [xMin, xMax] = scene.xRange;
  const steps = scene.steps ?? PLOT_DEFAULTS.steps;
  const [yMin, yMax] = scene.yRange ?? autoYRange(scene.functions, xMin, xMax, steps);

  const elements: DrawElement[] = [];
  let idN = 0;
  const nid = () => `fp-${++idN}`;

  const toPixelX = (wx: number) => ox + ((wx - xMin) / (xMax - xMin)) * w;
  const toPixelY = (wy: number) => oy + h - ((wy - yMin) / (yMax - yMin)) * h;

  const xTicks = tickMarksForRange(xMin, xMax, 8);
  const yTicks = tickMarksForRange(yMin, yMax, 6);

  // Gridlines
  if (scene.gridlines !== false) {
    for (const t of xTicks) {
      const px = toPixelX(t.value);
      elements.push({ id: nid(), type: 'line', from: { x: px, y: oy }, to: { x: px, y: oy + h }, color: '#e5e7eb', stroke_width: 0.5 });
    }
    for (const t of yTicks) {
      const py = toPixelY(t.value);
      elements.push({ id: nid(), type: 'line', from: { x: ox, y: py }, to: { x: ox + w, y: py }, color: '#e5e7eb', stroke_width: 0.5 });
    }
  }

  // Axes
  const xAxisY = clamp(toPixelY(0), oy, oy + h);
  const yAxisX = clamp(toPixelX(0), ox, ox + w);
  elements.push({ id: nid(), type: 'arrow', from: { x: ox, y: xAxisY }, to: { x: ox + w, y: xAxisY }, color: '#374151', stroke_width: 1.5 });
  elements.push({ id: nid(), type: 'arrow', from: { x: yAxisX, y: oy + h }, to: { x: yAxisX, y: oy }, color: '#374151', stroke_width: 1.5 });

  // Tick labels
  for (const t of xTicks) {
    if (Math.abs(t.value) < 1e-9) continue;
    elements.push({ id: nid(), type: 'text', x: toPixelX(t.value), y: xAxisY + 16, text: t.label, size: 11, color: '#6b7280' });
  }
  for (const t of yTicks) {
    if (Math.abs(t.value) < 1e-9) continue;
    elements.push({ id: nid(), type: 'text', x: yAxisX - 28, y: toPixelY(t.value) + 4, text: t.label, size: 11, color: '#6b7280' });
  }

  // Axis labels
  if (scene.xLabel) {
    elements.push({ id: nid(), type: 'text', x: ox + w + 10, y: xAxisY + 4, text: scene.xLabel, size: 14, color: '#374151' });
  }
  if (scene.yLabel) {
    elements.push({ id: nid(), type: 'text', x: yAxisX - 10, y: oy - 16, text: scene.yLabel, size: 14, color: '#374151' });
  }

  // Function curves (using discontinuity-aware sampling from math-sampling)
  for (let fi = 0; fi < scene.functions.length; fi++) {
    const fdef = scene.functions[fi]!;
    const color = fdef.color ?? DEFAULT_PLOT_COLORS[fi % DEFAULT_PLOT_COLORS.length]!;
    const segments = sampleFunction(fdef.fn, xMin, xMax, steps);
    for (const seg of segments) {
      for (let i = 0; i < seg.length - 1; i++) {
        const py1 = toPixelY(seg[i]!.y);
        const py2 = toPixelY(seg[i + 1]!.y);
        if ((py1 < oy - 50 && py2 < oy - 50) || (py1 > oy + h + 50 && py2 > oy + h + 50)) continue;
        elements.push({
          id: nid(), type: 'line',
          from: { x: toPixelX(seg[i]!.x), y: py1 },
          to: { x: toPixelX(seg[i + 1]!.x), y: py2 },
          color, stroke_width: 2,
        });
      }
    }
    if (fdef.label) {
      elements.push({ id: nid(), type: 'text', x: ox + w + 10, y: oy + 20 + fi * 20, text: fdef.label, size: 12, color });
    }
  }

  return { batch_id: `math-plot-${Date.now()}`, elements, source: 'template' };
}

function renderGeometryScene(scene: MathSceneGeometry): DrawBatch {
  const ox = scene.origin?.x ?? PLOT_DEFAULTS.ox;
  const oy = scene.origin?.y ?? PLOT_DEFAULTS.oy;
  const elements: DrawElement[] = [];
  let idN = 0;
  const nid = () => `geo-${++idN}`;

  for (const shape of scene.shapes) {
    const color = shape.color ?? '#2563eb';
    switch (shape.kind) {
      case 'point':
        if (shape.points[0]) {
          elements.push({ id: nid(), type: 'ellipse', cx: ox + shape.points[0].x, cy: oy + shape.points[0].y, rx: 4, ry: 4, color });
          if (shape.label) {
            elements.push({ id: nid(), type: 'text', x: ox + shape.points[0].x + 8, y: oy + shape.points[0].y - 8, text: shape.label, size: 12, color });
          }
        }
        break;
      case 'line_segment':
        if (shape.points.length >= 2) {
          elements.push({
            id: nid(), type: 'line',
            from: { x: ox + shape.points[0]!.x, y: oy + shape.points[0]!.y },
            to: { x: ox + shape.points[1]!.x, y: oy + shape.points[1]!.y },
            color, stroke_width: 2,
          });
          if (shape.label) {
            const mx = ox + (shape.points[0]!.x + shape.points[1]!.x) / 2;
            const my = oy + (shape.points[0]!.y + shape.points[1]!.y) / 2;
            elements.push({ id: nid(), type: 'text', x: mx, y: my - 10, text: shape.label, size: 12, color });
          }
        }
        break;
      case 'circle':
        if (shape.points[0] && shape.radius) {
          elements.push({ id: nid(), type: 'ellipse', cx: ox + shape.points[0].x, cy: oy + shape.points[0].y, rx: shape.radius, ry: shape.radius, color });
          if (shape.label) {
            elements.push({ id: nid(), type: 'text', x: ox + shape.points[0].x, y: oy + shape.points[0].y - shape.radius - 10, text: shape.label, size: 12, color });
          }
        }
        break;
      case 'polygon':
        for (let i = 0; i < shape.points.length; i++) {
          const p1 = shape.points[i]!;
          const p2 = shape.points[(i + 1) % shape.points.length]!;
          elements.push({
            id: nid(), type: 'line',
            from: { x: ox + p1.x, y: oy + p1.y },
            to: { x: ox + p2.x, y: oy + p2.y },
            color, stroke_width: 2,
          });
        }
        if (shape.label && shape.points.length > 0) {
          const cx = shape.points.reduce((s, p) => s + p.x, 0) / shape.points.length;
          const cy = shape.points.reduce((s, p) => s + p.y, 0) / shape.points.length;
          elements.push({ id: nid(), type: 'text', x: ox + cx, y: oy + cy, text: shape.label, size: 12, color });
        }
        break;
    }
  }

  return { batch_id: `math-geo-${Date.now()}`, elements, source: 'template' };
}

function renderAlgebraScene(scene: MathSceneAlgebra): DrawBatch {
  const ox = scene.origin?.x ?? PLOT_DEFAULTS.ox;
  const oy = scene.origin?.y ?? PLOT_DEFAULTS.oy;
  const elements: DrawElement[] = [];
  let idN = 0;
  const nid = () => `alg-${++idN}`;

  for (let i = 0; i < scene.equations.length; i++) {
    const eq = scene.equations[i]!;
    elements.push({ id: nid(), type: 'latex', x: ox, y: oy + i * 40, tex: eq.tex, displayMode: true, fontSize: 18 });
  }

  return { batch_id: `math-alg-${Date.now()}`, elements, source: 'template' };
}

/** Render a high-level math scene description into a DrawBatch. */
export function renderMathScene(scene: MathScene): DrawBatch {
  switch (scene.type) {
    case 'function_plot': return renderFunctionPlotScene(scene);
    case 'geometry': return renderGeometryScene(scene);
    case 'algebra': return renderAlgebraScene(scene);
  }
}

export function parseGraphScriptToSemanticBatch(input: unknown): {
  semanticBatch: SemanticBatch | null;
  plotBatch: DrawBatch | null;
  warnings: string[];
} {
  const warnings: string[] = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { semanticBatch: null, plotBatch: null, warnings: ['Graph script payload must be an object'] };
  }

  const payload = input as Record<string, unknown>;
  const batch_id = typeof payload.batch_id === 'string' && payload.batch_id.trim().length > 0
    ? payload.batch_id.trim()
    : `graph-${Date.now()}`;
  const rawScript = typeof payload.script === 'string' ? payload.script : '';
  if (rawScript.length > 50_000) {
    return { semanticBatch: null, plotBatch: null, warnings: ['Script exceeds maximum length'] };
  }
  // Strip control characters (keep \t, \n, \r)
  const script = rawScript.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  if (!script.trim()) {
    return { semanticBatch: null, plotBatch: null, warnings: ['Graph script is empty'] };
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

  // Plot state for `plot` / `curve` DSL commands
  const plotEntries: Array<{ expr: string; fn: (x: number) => number; color?: string; label?: string }> = [];
  let plotXRange: [number, number] = [-10, 10];
  let plotYRange: [number, number] | null = null;
  let plotSteps: number = PLOT_DEFAULTS.steps;
  let plotXLabel: string | undefined;
  let plotYLabel: string | undefined;
  let plotGridlines: boolean | undefined;

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
      // Plot range settings
      const xr = parsePair(kv.xrange);
      if (xr) plotXRange = [xr.first, xr.second];
      const yr = parsePair(kv.yrange);
      if (yr) plotYRange = [yr.first, yr.second];
      const stepsVal = toInt(kv.steps);
      if (stepsVal != null && stepsVal >= 2) plotSteps = stepsVal;
      if (kv.xlabel) plotXLabel = kv.xlabel;
      if (kv.ylabel) plotYLabel = kv.ylabel;
      if (kv.gridlines != null) plotGridlines = kv.gridlines !== 'false';
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

    if (COMMAND_PLOT_SET.has(command)) {
      const exprRaw = kv.fn ?? kv.expr ?? kv.function ?? positional[0];
      if (!exprRaw) {
        warnings.push(`line ${lineIdx + 1}: ${command} requires fn or expr`);
        continue;
      }
      const fn = parseMathExpression(exprRaw);
      if (!fn) {
        warnings.push(`line ${lineIdx + 1}: could not parse expression '${exprRaw}'`);
        continue;
      }
      const xr = parsePair(kv.xrange);
      if (xr) plotXRange = [xr.first, xr.second];
      const yr = parsePair(kv.yrange);
      if (yr) plotYRange = [yr.first, yr.second];
      const stepsVal = toInt(kv.steps);
      if (stepsVal != null && stepsVal >= 2) plotSteps = stepsVal;
      if (kv.xlabel) plotXLabel = kv.xlabel;
      if (kv.ylabel) plotYLabel = kv.ylabel;
      if (kv.gridlines != null) plotGridlines = kv.gridlines !== 'false';
      plotEntries.push({ expr: exprRaw, fn, color: kv.color, label: kv.label ?? exprRaw });
      continue;
    }

    warnings.push(`line ${lineIdx + 1}: unsupported command '${command}'`);
  }

  // Build plot batch from accumulated plot commands
  let plotBatch: DrawBatch | null = null;
  if (plotEntries.length > 0) {
    const scene: MathSceneFunctionPlot = {
      type: 'function_plot',
      functions: plotEntries.map((e) => ({ label: e.label ?? e.expr, fn: e.fn, color: e.color })),
      xRange: plotXRange,
      ...(plotYRange ? { yRange: plotYRange } : {}),
      steps: plotSteps,
      ...(plotXLabel ? { xLabel: plotXLabel } : {}),
      ...(plotYLabel ? { yLabel: plotYLabel } : {}),
      ...(plotGridlines !== undefined ? { gridlines: plotGridlines } : {}),
    };
    plotBatch = renderMathScene(scene);
    plotBatch.batch_id = `${batch_id}-plot`;
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

  if (blocks.length === 0 && !plotBatch) {
    return { semanticBatch: null, plotBatch: null, warnings: [...warnings, 'No drawable blocks were parsed from graph script'] };
  }

  if (blocks.length === 0) {
    return { semanticBatch: null, plotBatch, warnings };
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
    plotBatch,
    warnings,
  };
}
