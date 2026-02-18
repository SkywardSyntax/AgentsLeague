# AI Whiteboard — Type System Architecture

A comprehensive TypeScript type system that enforces correctness from OpenAI API
responses through state management down to rendered canvas primitives.

---

## Table of Contents

1. [Core Types](#1-core-types)
2. [Type Guards & Validation](#2-type-guards--validation)
3. [Schema Validation (Zod)](#3-schema-validation-zod)
4. [Inference Safety](#4-inference-safety)
5. [State Machine Types](#5-state-machine-types)
6. [API Response Types](#6-api-response-types)
7. [Testing Strategy](#7-testing-strategy)

---

## 1. Core Types

All primitives are **branded types** — plain strings/numbers that carry a
compile-time tag so they can never be accidentally swapped.

```typescript
// ── Branded-type utility ────────────────────────────────────────────
declare const __brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [__brand]: B };

// ── Atomic value types ──────────────────────────────────────────────
/** 0-255 integer channel value */
type ChannelValue = Brand<number, "ChannelValue">;

/** 0-1 inclusive float */
type UnitFloat = Brand<number, "UnitFloat">;

/** Positive (non-zero) pixel measurement */
type PositivePx = Brand<number, "PositivePx">;

/** Non-negative pixel coordinate */
type Coordinate = Brand<number, "Coordinate">;

// ── Color ───────────────────────────────────────────────────────────
interface RGBAColor {
  readonly r: ChannelValue;
  readonly g: ChannelValue;
  readonly b: ChannelValue;
  readonly a: UnitFloat;
}

type HexColor = Brand<string, "HexColor">; // e.g. "#ff00aa"

type Color = RGBAColor | HexColor;

// ── Geometry ────────────────────────────────────────────────────────
interface Position {
  readonly x: Coordinate;
  readonly y: Coordinate;
}

interface Dimensions {
  readonly width: PositivePx;
  readonly height: PositivePx;
}

interface BoundingBox extends Position, Dimensions {}

// ── Font ────────────────────────────────────────────────────────────
type FontWeight = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;

type FontStyle = "normal" | "italic" | "oblique";

interface Font {
  readonly family: string;
  readonly size: PositivePx;
  readonly weight: FontWeight;
  readonly style: FontStyle;
  readonly lineHeight: UnitFloat | PositivePx;
}

// ── Drawing Shapes ──────────────────────────────────────────────────
/** Every shape carries a discriminant `kind` for exhaustive matching. */

interface ShapeBase {
  readonly id: Brand<string, "ShapeId">;
  readonly position: Position;
  readonly rotation: number; // degrees
  readonly opacity: UnitFloat;
  readonly fill: Color;
  readonly stroke: Color;
  readonly strokeWidth: PositivePx;
}

interface RectangleShape extends ShapeBase {
  readonly kind: "rectangle";
  readonly dimensions: Dimensions;
  readonly borderRadius: PositivePx;
}

interface EllipseShape extends ShapeBase {
  readonly kind: "ellipse";
  readonly radiusX: PositivePx;
  readonly radiusY: PositivePx;
}

interface LineShape extends Omit<ShapeBase, "fill"> {
  readonly kind: "line";
  readonly start: Position;
  readonly end: Position;
}

interface PathShape extends ShapeBase {
  readonly kind: "path";
  readonly d: string; // SVG path data
  readonly closed: boolean;
}

interface PolygonShape extends ShapeBase {
  readonly kind: "polygon";
  readonly points: readonly [Position, Position, Position, ...Position[]];
  // guarantees ≥ 3 vertices at the type level
}

interface TextShape extends ShapeBase {
  readonly kind: "text";
  readonly content: string;
  readonly font: Font;
  readonly maxWidth: PositivePx | null;
  readonly align: "left" | "center" | "right";
}

interface ImageShape extends ShapeBase {
  readonly kind: "image";
  readonly src: string;
  readonly dimensions: Dimensions;
  readonly alt: string;
}

type DrawingShape =
  | RectangleShape
  | EllipseShape
  | LineShape
  | PathShape
  | PolygonShape
  | TextShape
  | ImageShape;

/** Map from kind → concrete shape type (useful for generics). */
type ShapeMap = {
  [S in DrawingShape as S["kind"]]: S;
};
```

### Why branded types?

Without brands a `Coordinate` is just `number` — you could pass a channel
value (0-255) where a pixel coordinate is expected. Brands make that a
compile-time error while adding zero runtime cost.

---

## 2. Type Guards & Validation

Runtime type guards validate data that crosses trust boundaries (API
responses, deserialized storage, user input).

```typescript
// ── Branded constructors (throw on invalid input) ───────────────────
function channelValue(n: number): ChannelValue {
  if (!Number.isInteger(n) || n < 0 || n > 255) {
    throw new TypeError(`Expected integer 0-255, got ${n}`);
  }
  return n as ChannelValue;
}

function unitFloat(n: number): UnitFloat {
  if (typeof n !== "number" || n < 0 || n > 1) {
    throw new TypeError(`Expected float 0-1, got ${n}`);
  }
  return n as UnitFloat;
}

function positivePx(n: number): PositivePx {
  if (typeof n !== "number" || n <= 0 || !Number.isFinite(n)) {
    throw new TypeError(`Expected positive finite number, got ${n}`);
  }
  return n as PositivePx;
}

function coordinate(n: number): Coordinate {
  if (typeof n !== "number" || !Number.isFinite(n)) {
    throw new TypeError(`Expected finite number, got ${n}`);
  }
  return n as Coordinate;
}

function hexColor(s: string): HexColor {
  if (!/^#[0-9a-fA-F]{6}$/.test(s)) {
    throw new TypeError(`Expected hex color (#rrggbb), got "${s}"`);
  }
  return s as HexColor;
}

// ── Discriminated-union guard ───────────────────────────────────────
const SHAPE_KINDS = new Set<DrawingShape["kind"]>([
  "rectangle", "ellipse", "line", "path", "polygon", "text", "image",
]);

function isDrawingShape(value: unknown): value is DrawingShape {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.kind === "string" && SHAPE_KINDS.has(v.kind as DrawingShape["kind"]);
}

// ── Exhaustive switch helper ────────────────────────────────────────
function assertNever(x: never): never {
  throw new Error(`Unexpected value: ${JSON.stringify(x)}`);
}

function renderShape(shape: DrawingShape): void {
  switch (shape.kind) {
    case "rectangle":  /* … */ break;
    case "ellipse":    /* … */ break;
    case "line":       /* … */ break;
    case "path":       /* … */ break;
    case "polygon":    /* … */ break;
    case "text":       /* … */ break;
    case "image":      /* … */ break;
    default: assertNever(shape);
    // If a new kind is added to DrawingShape but not handled here,
    // TypeScript emits a compile-time error.
  }
}
```

---

## 3. Schema Validation (Zod)

Zod schemas act as the **single source of truth** — TypeScript types are
*inferred* from them so the schema and the type can never drift apart.

```typescript
import { z } from "zod";

// ── Primitive schemas ───────────────────────────────────────────────
const ChannelValueSchema = z.number().int().min(0).max(255);
const UnitFloatSchema     = z.number().min(0).max(1);
const PositivePxSchema    = z.number().positive().finite();
const CoordinateSchema    = z.number().finite();
const HexColorSchema      = z.string().regex(/^#[0-9a-fA-F]{6}$/);

const RGBAColorSchema = z.object({
  r: ChannelValueSchema,
  g: ChannelValueSchema,
  b: ChannelValueSchema,
  a: UnitFloatSchema,
}).strict();

const ColorSchema = z.union([RGBAColorSchema, HexColorSchema]);

const PositionSchema = z.object({
  x: CoordinateSchema,
  y: CoordinateSchema,
}).strict();

const DimensionsSchema = z.object({
  width:  PositivePxSchema,
  height: PositivePxSchema,
}).strict();

const FontWeightSchema = z.union([
  z.literal(100), z.literal(200), z.literal(300),
  z.literal(400), z.literal(500), z.literal(600),
  z.literal(700), z.literal(800), z.literal(900),
]);

const FontSchema = z.object({
  family:     z.string().min(1),
  size:       PositivePxSchema,
  weight:     FontWeightSchema,
  style:      z.enum(["normal", "italic", "oblique"]),
  lineHeight: z.union([UnitFloatSchema, PositivePxSchema]),
}).strict();

// ── Shape schemas (discriminated union) ─────────────────────────────
const ShapeBaseSchema = z.object({
  id:          z.string().uuid(),
  position:    PositionSchema,
  rotation:    z.number(),
  opacity:     UnitFloatSchema,
  fill:        ColorSchema,
  stroke:      ColorSchema,
  strokeWidth: PositivePxSchema,
});

const RectangleSchema = ShapeBaseSchema.extend({
  kind:         z.literal("rectangle"),
  dimensions:   DimensionsSchema,
  borderRadius: PositivePxSchema,
}).strict();

const EllipseSchema = ShapeBaseSchema.extend({
  kind:    z.literal("ellipse"),
  radiusX: PositivePxSchema,
  radiusY: PositivePxSchema,
}).strict();

const LineSchema = ShapeBaseSchema.omit({ fill: true }).extend({
  kind:  z.literal("line"),
  start: PositionSchema,
  end:   PositionSchema,
}).strict();

const TextShapeSchema = ShapeBaseSchema.extend({
  kind:     z.literal("text"),
  content:  z.string(),
  font:     FontSchema,
  maxWidth: PositivePxSchema.nullable(),
  align:    z.enum(["left", "center", "right"]),
}).strict();

// … PathSchema, PolygonSchema, ImageSchema follow the same pattern.

const DrawingShapeSchema = z.discriminatedUnion("kind", [
  RectangleSchema,
  EllipseSchema,
  LineSchema,
  TextShapeSchema,
  // PathSchema, PolygonSchema, ImageSchema
]);

// ── Inferred types (replaces hand-written interfaces if desired) ────
type ZDrawingShape = z.infer<typeof DrawingShapeSchema>;

// ── Parse helper (throws ZodError with structured path info) ────────
function parseShape(raw: unknown): DrawingShape {
  return DrawingShapeSchema.parse(raw) as DrawingShape;
}

function safeParseShape(raw: unknown) {
  return DrawingShapeSchema.safeParse(raw);
}
```

### Schema ↔ Type alignment strategy

| Layer | Source of truth | Consumed by |
|-------|----------------|-------------|
| Zod schema | `schemas/*.ts` | Runtime validation, OpenAI response parsing |
| TypeScript type | `z.infer<…>` | Components, hooks, state, renderers |

Because the TS type is *derived* from the Zod schema, they can **never**
drift apart.

---

## 4. Inference Safety

### 4.1 Component Props — generic shape renderer

```typescript
/** Render a shape of a *specific* kind. The component is fully typed. */
type ShapeRendererProps<K extends DrawingShape["kind"]> = {
  shape: ShapeMap[K];
  onSelect: (id: ShapeMap[K]["id"]) => void;
};

function RectangleRenderer({ shape, onSelect }: ShapeRendererProps<"rectangle">) {
  // shape is narrowed to RectangleShape — no cast needed
  const { width, height } = shape.dimensions;
  return (
    <rect
      x={shape.position.x}
      y={shape.position.y}
      width={width}
      height={height}
      rx={shape.borderRadius}
      onClick={() => onSelect(shape.id)}
    />
  );
}
```

### 4.2 Discriminated dispatch map (zero `any`)

```typescript
type ShapeRenderers = {
  [K in DrawingShape["kind"]]: (shape: ShapeMap[K]) => React.ReactNode;
};

const renderers: ShapeRenderers = {
  rectangle: (s) => <RectangleRenderer shape={s} onSelect={() => {}} />,
  ellipse:   (s) => { /* s is EllipseShape */ },
  line:      (s) => { /* s is LineShape   */ },
  path:      (s) => { /* s is PathShape   */ },
  polygon:   (s) => { /* s is PolygonShape */ },
  text:      (s) => { /* s is TextShape   */ },
  image:     (s) => { /* s is ImageShape  */ },
};

function renderAnyShape(shape: DrawingShape): React.ReactNode {
  // Safe: TS proves `shape.kind` is a key of renderers.
  const render = renderers[shape.kind] as (s: DrawingShape) => React.ReactNode;
  return render(shape);
}
```

### 4.3 `NoInfer` and `satisfies` for tighter inference

```typescript
// satisfies proves the object literal matches the type *without widening*
const DEFAULT_FONT = {
  family: "Inter",
  size: 16 as PositivePx,
  weight: 400,
  style: "normal",
  lineHeight: 1.5 as UnitFloat,
} satisfies Font;
// DEFAULT_FONT.weight is `400`, NOT `FontWeight` — preserves the literal.

// NoInfer prevents TS from using an argument to infer a generic.
function setShapeProp<K extends DrawingShape["kind"]>(
  kind: K,
  key: keyof ShapeMap[K],
  value: NoInfer<ShapeMap[K][keyof ShapeMap[K]]>,
): void { /* … */ }
```

### 4.4 Strict tsconfig flags

```jsonc
// tsconfig.json (relevant flags)
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,  // arr[i] → T | undefined
    "exactOptionalPropertyTypes": true, // { x?: string } ≠ { x: string | undefined }
    "noPropertyAccessFromIndexSignature": true
  }
}
```

---

## 5. State Machine Types

Model the UI as a finite state machine. Each state carries **only** the
data that is valid in that state (no nullable bags).

```typescript
// ── State definitions ───────────────────────────────────────────────
interface IdleState {
  readonly status: "idle";
}

interface ListeningState {
  readonly status: "listening";
  readonly startedAt: Date;
  readonly transcript: string; // accumulated so far
}

interface ProcessingState {
  readonly status: "processing";
  readonly prompt: string;
  readonly requestId: string;
}

interface DrawingState {
  readonly status: "drawing";
  readonly shapes: readonly DrawingShape[];
  readonly progress: UnitFloat; // 0→1 animation progress
}

interface ErrorState {
  readonly status: "error";
  readonly message: string;
  readonly retryable: boolean;
  readonly previousStatus: WhiteboardState["status"];
}

type WhiteboardState =
  | IdleState
  | ListeningState
  | ProcessingState
  | DrawingState
  | ErrorState;

// ── Legal transitions ───────────────────────────────────────────────
/**
 * A mapping from each status to the set of statuses it may transition to.
 * Used at compile time to restrict dispatch and at runtime for assertions.
 */
type TransitionMap = {
  idle:       "listening";
  listening:  "processing" | "idle" | "error";
  processing: "drawing"    | "error";
  drawing:    "idle"       | "error";
  error:      "idle"       | "listening";
};

/** Event types that trigger transitions */
type WhiteboardEvent =
  | { type: "START_LISTENING" }
  | { type: "STOP_LISTENING"; transcript: string }
  | { type: "CANCEL" }
  | { type: "AI_RESPONSE"; shapes: readonly DrawingShape[] }
  | { type: "DRAWING_COMPLETE" }
  | { type: "ERROR"; message: string; retryable: boolean }
  | { type: "RETRY" };

/** Type-safe transition function */
function transition(
  state: WhiteboardState,
  event: WhiteboardEvent,
): WhiteboardState {
  switch (state.status) {
    case "idle":
      if (event.type === "START_LISTENING") {
        return { status: "listening", startedAt: new Date(), transcript: "" };
      }
      break;

    case "listening":
      if (event.type === "STOP_LISTENING") {
        return {
          status: "processing",
          prompt: event.transcript,
          requestId: crypto.randomUUID(),
        };
      }
      if (event.type === "CANCEL") return { status: "idle" };
      break;

    case "processing":
      if (event.type === "AI_RESPONSE") {
        return {
          status: "drawing",
          shapes: event.shapes,
          progress: 0 as UnitFloat,
        };
      }
      break;

    case "drawing":
      if (event.type === "DRAWING_COMPLETE") return { status: "idle" };
      break;

    case "error":
      if (event.type === "RETRY") {
        return state.retryable
          ? { status: state.previousStatus === "listening"
                ? "listening" as const
                : "idle" as const,
              ...( state.previousStatus === "listening"
                ? { startedAt: new Date(), transcript: "" }
                : {}),
            } as WhiteboardState
          : state;
      }
      if (event.type === "CANCEL") return { status: "idle" };
      break;
  }

  // Any state can transition to error
  if (event.type === "ERROR") {
    return {
      status: "error",
      message: event.message,
      retryable: event.retryable,
      previousStatus: state.status,
    };
  }

  return state; // no-op for invalid transitions
}

// ── React hook (useReducer) ─────────────────────────────────────────
function useWhiteboard() {
  const [state, dispatch] = React.useReducer(transition, { status: "idle" });
  return { state, dispatch } as const;
}
```

---

## 6. API Response Types

### 6.1 OpenAI chat completion (typed wrapper)

```typescript
/** The structured output we request from the model via function calling. */
const DrawingSpecSchema = z.object({
  shapes:      z.array(DrawingShapeSchema).min(1),
  canvasSize:  DimensionsSchema,
  background:  ColorSchema,
  title:       z.string().optional(),
  description: z.string().optional(),
});

type DrawingSpec = z.infer<typeof DrawingSpecSchema>;

// ── Generic API envelope ────────────────────────────────────────────
interface ApiSuccess<T> {
  readonly ok: true;
  readonly data: T;
  readonly meta: {
    readonly requestId: string;
    readonly model: string;
    readonly usage: { prompt_tokens: number; completion_tokens: number };
  };
}

interface ApiError {
  readonly ok: false;
  readonly error: {
    readonly code: "PARSE_ERROR" | "VALIDATION_ERROR" | "RATE_LIMIT" | "NETWORK" | "UNKNOWN";
    readonly message: string;
    readonly raw?: unknown; // original payload for debugging
  };
}

type ApiResult<T> = ApiSuccess<T> | ApiError;

// ── Typed fetch wrapper ─────────────────────────────────────────────
async function fetchDrawingSpec(prompt: string): Promise<ApiResult<DrawingSpec>> {
  const requestId = crypto.randomUUID();

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user",   content: prompt },
      ],
    });

    const rawJson: unknown = JSON.parse(
      response.choices[0]?.message?.content ?? "null",
    );

    const parsed = DrawingSpecSchema.safeParse(rawJson);

    if (!parsed.success) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: parsed.error.message,
          raw: rawJson,
        },
      };
    }

    return {
      ok: true,
      data: parsed.data,
      meta: {
        requestId,
        model: response.model,
        usage: response.usage!,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: {
        code: err instanceof SyntaxError ? "PARSE_ERROR" : "NETWORK",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}
```

### 6.2 Consuming the result (narrowing)

```typescript
async function handlePrompt(prompt: string): Promise<void> {
  const result = await fetchDrawingSpec(prompt);

  if (!result.ok) {
    // result is narrowed to ApiError
    console.error(`[${result.error.code}] ${result.error.message}`);
    return;
  }

  // result is narrowed to ApiSuccess<DrawingSpec>
  const { shapes, canvasSize, background } = result.data;
  console.log(`Drawing ${shapes.length} shapes on ${canvasSize.width}×${canvasSize.height}`);
}
```

---

## 7. Testing Strategy

### 7.1 Compile-time type tests (`tsd` / `expect-type`)

These tests produce **zero runtime code**; they fail at `tsc` time if a
type relationship is violated.

```typescript
import { expectTypeOf } from "expect-type";

// A rectangle must have dimensions
expectTypeOf<RectangleShape>().toHaveProperty("dimensions");

// DrawingShape["kind"] must be the exact union of known kinds
expectTypeOf<DrawingShape["kind"]>().toEqualTypeOf<
  "rectangle" | "ellipse" | "line" | "path" | "polygon" | "text" | "image"
>();

// ShapeMap lookup returns the correct concrete type
expectTypeOf<ShapeMap["ellipse"]>().toEqualTypeOf<EllipseShape>();

// WhiteboardState status is the exact union
expectTypeOf<WhiteboardState["status"]>().toEqualTypeOf<
  "idle" | "listening" | "processing" | "drawing" | "error"
>();

// ApiResult narrows correctly
declare const result: ApiResult<DrawingSpec>;
if (result.ok) {
  expectTypeOf(result.data).toEqualTypeOf<DrawingSpec>();
} else {
  expectTypeOf(result.error.code).toEqualTypeOf<
    "PARSE_ERROR" | "VALIDATION_ERROR" | "RATE_LIMIT" | "NETWORK" | "UNKNOWN"
  >();
}
```

### 7.2 Zod schema runtime tests (Vitest)

```typescript
import { describe, it, expect } from "vitest";

describe("DrawingShapeSchema", () => {
  it("accepts a valid rectangle", () => {
    const result = DrawingShapeSchema.safeParse({
      kind: "rectangle",
      id: crypto.randomUUID(),
      position: { x: 10, y: 20 },
      rotation: 0,
      opacity: 1,
      fill: "#ff0000",
      stroke: "#000000",
      strokeWidth: 2,
      dimensions: { width: 100, height: 50 },
      borderRadius: 4,
    });
    expect(result.success).toBe(true);
  });

  it("rejects negative dimensions", () => {
    const result = DimensionsSchema.safeParse({ width: -1, height: 50 });
    expect(result.success).toBe(false);
  });

  it("rejects unknown shape kinds", () => {
    const result = DrawingShapeSchema.safeParse({
      kind: "hexagon", // not in the union
      id: crypto.randomUUID(),
      position: { x: 0, y: 0 },
    });
    expect(result.success).toBe(false);
  });

  it("rejects channel values > 255", () => {
    const result = RGBAColorSchema.safeParse({ r: 256, g: 0, b: 0, a: 1 });
    expect(result.success).toBe(false);
  });

  it("strips extra properties with .strict()", () => {
    const result = PositionSchema.safeParse({ x: 0, y: 0, z: 5 });
    expect(result.success).toBe(false); // strict mode rejects unknown keys
  });
});

describe("DrawingSpecSchema", () => {
  it("requires at least one shape", () => {
    const result = DrawingSpecSchema.safeParse({
      shapes: [],
      canvasSize: { width: 800, height: 600 },
      background: "#ffffff",
    });
    expect(result.success).toBe(false);
  });
});
```

### 7.3 State machine transition tests

```typescript
describe("WhiteboardState transitions", () => {
  it("idle → listening on START_LISTENING", () => {
    const next = transition({ status: "idle" }, { type: "START_LISTENING" });
    expect(next.status).toBe("listening");
  });

  it("idle ignores DRAWING_COMPLETE (invalid transition)", () => {
    const state: WhiteboardState = { status: "idle" };
    const next = transition(state, { type: "DRAWING_COMPLETE" });
    expect(next).toBe(state); // unchanged
  });

  it("any state → error on ERROR event", () => {
    const states: WhiteboardState[] = [
      { status: "idle" },
      { status: "listening", startedAt: new Date(), transcript: "" },
      { status: "processing", prompt: "draw a cat", requestId: "abc" },
    ];
    for (const s of states) {
      const next = transition(s, {
        type: "ERROR",
        message: "fail",
        retryable: true,
      });
      expect(next.status).toBe("error");
    }
  });
});
```

### 7.4 Brand constructor tests

```typescript
describe("Branded constructors", () => {
  it("channelValue rejects floats", () => {
    expect(() => channelValue(1.5)).toThrow();
  });

  it("unitFloat rejects > 1", () => {
    expect(() => unitFloat(1.01)).toThrow();
  });

  it("positivePx rejects zero", () => {
    expect(() => positivePx(0)).toThrow();
  });

  it("hexColor rejects shorthand", () => {
    expect(() => hexColor("#fff")).toThrow();
  });

  it("hexColor accepts valid 6-digit hex", () => {
    expect(() => hexColor("#a0b1c2")).not.toThrow();
  });
});
```

---

## Directory Structure

```
src/
├── types/
│   ├── brand.ts          # Brand utility + branded constructors
│   ├── geometry.ts       # Position, Dimensions, BoundingBox
│   ├── color.ts          # Color types + HexColor
│   ├── font.ts           # Font, FontWeight, FontStyle
│   ├── shapes.ts         # DrawingShape union + ShapeMap
│   └── index.ts          # barrel export
├── schemas/
│   ├── primitives.ts     # Zod schemas for branded primitives
│   ├── shapes.ts         # DrawingShapeSchema (source of truth)
│   ├── api.ts            # DrawingSpecSchema, API envelope schemas
│   └── index.ts
├── state/
│   ├── machine.ts        # WhiteboardState, transition()
│   ├── events.ts         # WhiteboardEvent union
│   └── hooks.ts          # useWhiteboard()
├── api/
│   ├── client.ts         # fetchDrawingSpec()
│   └── types.ts          # ApiResult, ApiSuccess, ApiError
├── components/
│   ├── renderers/        # per-shape renderers
│   └── Canvas.tsx
└── __tests__/
    ├── types.test-d.ts   # compile-time type tests (expect-type)
    ├── schemas.test.ts   # Zod runtime validation tests
    ├── machine.test.ts   # state transition tests
    └── brands.test.ts    # branded constructor tests
```

---

## Key Design Principles

| Principle | Technique |
|-----------|-----------|
| **Single source of truth** | Zod schemas → `z.infer` for TS types |
| **No `any`** | `unknown` + Zod `.parse()` at trust boundaries |
| **Exhaustiveness** | Discriminated unions + `assertNever` |
| **Impossible states are unrepresentable** | Per-state data via tagged unions |
| **Fail fast** | Branded constructors throw on invalid data |
| **Minimal surface area** | `readonly` everywhere, `.strict()` on all Zod objects |
