# OpenAI API Integration Plan — AI Whiteboard Drawing Spec Generator

## Table of Contents

1. [Model Selection](#1-model-selection)
2. [Tool Use Workflow](#2-tool-use-workflow)
3. [Streaming Strategy](#3-streaming-strategy)
4. [Spec Format Design](#4-spec-format-design)
5. [Error Handling](#5-error-handling)
6. [Latency Optimization](#6-latency-optimization)
7. [.env Configuration](#7-env-configuration)

---

## 1. Model Selection

### Recommended Models (all support tool use / function calling)

| Model | Vision | Tool Use | Structured Output | Best For |
|---|---|---|---|---|
| **`gpt-4o`** ✅ Primary | ✅ | ✅ | ✅ (`strict: true`) | Vision input + drawing spec output. Accepts whiteboard screenshots for context-aware edits. |
| **`gpt-4o-mini`** | ✅ | ✅ | ✅ | Budget-friendly fallback, ~80% cheaper. Good for simple shapes/text. |
| **`gpt-4.1`** | ✅ | ✅ | ✅ | Coding-focused variant; strong at precise coordinate math. |
| **`o4-mini`** | ✅ | ✅ | ✅ | Reasoning model; use for complex multi-step layouts. |

### Decision Matrix

```
User prompt is simple text/shape → gpt-4o-mini  (fast, cheap)
User prompt references an image  → gpt-4o       (vision + tools)
User prompt needs complex layout → o4-mini       (reasoning)
```

### API: Use the Responses API (not Chat Completions)

The Responses API (`client.responses.create`) is the current recommended path. It provides:
- Native streaming with semantic event types
- `tool_choice: "required"` to force tool calls
- `strict: true` on function schemas for guaranteed JSON schema adherence
- Built-in conversation state via `previous_response_id`

---

## 2. Tool Use Workflow

### 2.1 The `draw` Tool — Function Definition

```json
{
  "type": "function",
  "name": "draw",
  "description": "Renders drawing elements onto the whiteboard canvas. Call this tool with a complete drawing specification containing shapes, text, connectors, and groups. Every user request MUST result in at least one draw() call. Do not respond with text alone.",
  "parameters": {
    "type": "object",
    "properties": {
      "canvas": {
        "type": "object",
        "description": "Canvas configuration",
        "properties": {
          "width":  { "type": "number", "description": "Canvas width in px" },
          "height": { "type": "number", "description": "Canvas height in px" }
        },
        "required": ["width", "height"],
        "additionalProperties": false
      },
      "elements": {
        "type": "array",
        "description": "Ordered list of drawing elements, rendered bottom-to-top (index 0 = backmost).",
        "items": {
          "type": "object",
          "properties": {
            "id":   { "type": "string", "description": "Unique element ID (e.g. 'rect-1')" },
            "type": {
              "type": "string",
              "enum": ["rectangle", "ellipse", "line", "arrow", "path", "text", "image", "group"],
              "description": "Element type"
            },
            "x":      { "type": "number", "description": "X position (top-left origin)" },
            "y":      { "type": "number", "description": "Y position (top-left origin)" },
            "width":  { "type": "number" },
            "height": { "type": "number" },
            "rotation": { "type": "number", "description": "Rotation in degrees, default 0" },
            "style": {
              "type": "object",
              "properties": {
                "fill":         { "type": "string", "description": "CSS color, e.g. '#3B82F6' or 'transparent'" },
                "stroke":       { "type": "string", "description": "Stroke color" },
                "strokeWidth":  { "type": "number", "description": "Stroke width in px" },
                "opacity":      { "type": "number", "description": "0.0-1.0" },
                "borderRadius": { "type": "number", "description": "Corner radius in px" },
                "fontSize":     { "type": "number" },
                "fontFamily":   { "type": "string" },
                "fontWeight":   { "type": "string", "enum": ["normal", "bold"] },
                "textAlign":    { "type": "string", "enum": ["left", "center", "right"] },
                "color":        { "type": "string", "description": "Text color" }
              },
              "additionalProperties": false
            },
            "text":     { "type": "string", "description": "Text content (for type=text)" },
            "points":   {
              "type": "array",
              "description": "For line/arrow/path: array of [x, y] coordinate pairs",
              "items": {
                "type": "array",
                "items": { "type": "number" }
              }
            },
            "children": {
              "type": "array",
              "description": "Child element IDs (for type=group)",
              "items": { "type": "string" }
            }
          },
          "required": ["id", "type", "x", "y"],
          "additionalProperties": false
        }
      }
    },
    "required": ["canvas", "elements"],
    "additionalProperties": false
  },
  "strict": true
}
```

### 2.2 Enforcing Tool Completion Before Next Steps

```python
# Force the model to ALWAYS call the draw tool — never respond with text only
response = client.responses.create(
    model="gpt-4o",
    tools=[draw_tool],
    tool_choice="required",       # ← model MUST emit a function_call
    input=conversation,
    instructions=SYSTEM_PROMPT,
)
```

**`tool_choice` options:**

| Value | Behavior |
|---|---|
| `"auto"` | Model decides whether to call tools (default) |
| `"required"` | Model MUST call at least one tool. **Use this.** |
| `"none"` | Model cannot call tools |
| `{"type": "function", "name": "draw"}` | Model must call `draw` specifically |

### 2.3 Multi-Turn Conversation Loop

```python
from openai import OpenAI
import json

client = OpenAI()  # reads OPENAI_API_KEY from env

SYSTEM_PROMPT = """You are an AI whiteboard assistant. You ALWAYS respond by calling
the draw() tool with a complete drawing specification. Never respond with text alone.

Coordinate system: origin (0,0) is top-left. Units are pixels.
Default canvas: 1920x1080.

When the user says "add", append to existing elements.
When the user says "replace" or gives a fresh prompt, start from scratch.
When the user uploads an image, analyze it and recreate/extend it."""

draw_tool = { ... }  # schema from §2.1

def generate_drawing(user_message: str, history: list, image_url: str | None = None):
    # Build input
    content = []
    if image_url:
        content.append({"type": "input_image", "image_url": image_url})
    content.append({"type": "input_text", "text": user_message})

    history.append({"role": "user", "content": content})

    response = client.responses.create(
        model="gpt-4o",
        instructions=SYSTEM_PROMPT,
        tools=[draw_tool],
        tool_choice="required",
        input=history,
        max_output_tokens=4096,
    )

    # Extract the draw call
    for item in response.output:
        if item.type == "function_call" and item.name == "draw":
            spec = json.loads(item.arguments)

            # Append model output + tool result to history for multi-turn
            history.append(item)
            history.append({
                "type": "function_call_output",
                "call_id": item.call_id,
                "output": json.dumps({"status": "rendered", "element_count": len(spec["elements"])})
            })
            return spec

    raise ValueError("Model did not produce a draw call")
```

---

## 3. Streaming Strategy

### 3.1 Why Stream?

Drawing specs can be large (dozens of elements). Without streaming, the user waits 2-5s for the full response. With streaming, we can:

1. Show a progress indicator as soon as the function name arrives
2. Parse partial JSON to render elements as they complete
3. Reduce perceived latency by 60-80%

### 3.2 Streaming Implementation

```python
import json
from openai import OpenAI

client = OpenAI()

def stream_drawing(user_message: str, history: list):
    history.append({"role": "user", "content": user_message})

    stream = client.responses.create(
        model="gpt-4o",
        instructions=SYSTEM_PROMPT,
        tools=[draw_tool],
        tool_choice="required",
        input=history,
        stream=True,
    )

    current_call_id = None
    current_name = None
    arguments_buffer = ""

    for event in stream:
        match event.type:
            # Tool call started — we know which function
            case "response.output_item.added":
                if hasattr(event, "item") and event.item.type == "function_call":
                    current_name = event.item.name
                    current_call_id = event.item.call_id
                    yield {"event": "tool_start", "name": current_name}

            # Partial arguments arriving
            case "response.function_call_arguments.delta":
                arguments_buffer += event.delta
                # Attempt incremental JSON parse for early rendering
                partial = try_parse_partial_elements(arguments_buffer)
                if partial:
                    yield {"event": "partial_spec", "elements": partial}

            # Tool call complete
            case "response.function_call_arguments.done":
                spec = json.loads(arguments_buffer)
                yield {"event": "complete_spec", "spec": spec}
                arguments_buffer = ""

            # Error
            case "error":
                yield {"event": "error", "detail": str(event)}

            case "response.completed":
                yield {"event": "done"}


def try_parse_partial_elements(buffer: str) -> list | None:
    """
    Attempt to extract fully-formed element objects from a partial JSON buffer.
    Uses a streaming JSON parser to find complete objects in the 'elements' array
    even before the entire JSON is valid.
    """
    try:
        # Find the elements array start
        idx = buffer.find('"elements"')
        if idx == -1:
            return None

        arr_start = buffer.find("[", idx)
        if arr_start == -1:
            return None

        # Try to extract complete objects by finding matched braces
        elements = []
        depth = 0
        obj_start = None

        for i in range(arr_start + 1, len(buffer)):
            if buffer[i] == "{":
                if depth == 0:
                    obj_start = i
                depth += 1
            elif buffer[i] == "}":
                depth -= 1
                if depth == 0 and obj_start is not None:
                    try:
                        el = json.loads(buffer[obj_start : i + 1])
                        elements.append(el)
                    except json.JSONDecodeError:
                        pass
                    obj_start = None

        return elements if elements else None
    except Exception:
        return None
```

### 3.3 Frontend Integration (Server-Sent Events)

```
Client                          Server                         OpenAI
  |--- POST /api/draw ----------->|                               |
  |                                |--- responses.create(stream) ->|
  |                                |<-- output_item.added ---------|
  |<-- SSE: tool_start ------------|                               |
  |                                |<-- arguments.delta ---------- |
  |<-- SSE: partial_spec ---------|  (parse partial elements)      |
  |     [render rect-1]           |                               |
  |<-- SSE: partial_spec ---------|<-- arguments.delta ---------- |
  |     [render rect-1, text-1]   |                               |
  |                                |<-- arguments.done ----------- |
  |<-- SSE: complete_spec --------|                               |
  |     [final render + validate] |                               |
```

### 3.4 Key Streaming Events Reference

| Event Type | When | Action |
|---|---|---|
| `response.output_item.added` | Tool call starts | Show "Generating drawing…" |
| `response.function_call_arguments.delta` | Each token chunk | Attempt partial parse, render complete elements |
| `response.function_call_arguments.done` | Full arguments ready | Final render, validate schema |
| `response.completed` | Full response done | Clean up, update history |
| `error` | Any failure | Show error, retry |

---

## 4. Spec Format Design

### 4.1 Complete JSON Schema

```jsonc
{
  "canvas": {
    "width": 1920,
    "height": 1080
  },
  "elements": [
    // Rectangle
    {
      "id": "bg-1",
      "type": "rectangle",
      "x": 0, "y": 0,
      "width": 1920, "height": 1080,
      "style": { "fill": "#F8FAFC", "stroke": "transparent", "strokeWidth": 0 }
    },
    // Rounded card
    {
      "id": "card-1",
      "type": "rectangle",
      "x": 660, "y": 340,
      "width": 600, "height": 400,
      "style": {
        "fill": "#FFFFFF",
        "stroke": "#E2E8F0",
        "strokeWidth": 2,
        "borderRadius": 16,
        "opacity": 1.0
      }
    },
    // Text heading
    {
      "id": "title-1",
      "type": "text",
      "x": 710, "y": 380,
      "width": 500, "height": 48,
      "text": "System Architecture",
      "style": {
        "fontSize": 32,
        "fontFamily": "Inter",
        "fontWeight": "bold",
        "textAlign": "center",
        "color": "#1E293B"
      }
    },
    // Ellipse
    {
      "id": "circle-1",
      "type": "ellipse",
      "x": 860, "y": 500,
      "width": 200, "height": 200,
      "style": { "fill": "#3B82F6", "stroke": "#1D4ED8", "strokeWidth": 2 }
    },
    // Arrow connector
    {
      "id": "arrow-1",
      "type": "arrow",
      "x": 0, "y": 0,
      "points": [[960, 700], [960, 800], [1100, 800]],
      "style": { "stroke": "#64748B", "strokeWidth": 2 }
    },
    // Freehand path
    {
      "id": "path-1",
      "type": "path",
      "x": 0, "y": 0,
      "points": [[100, 100], [150, 90], [200, 110], [250, 95]],
      "style": { "stroke": "#EF4444", "strokeWidth": 3, "fill": "transparent" }
    },
    // Group
    {
      "id": "group-1",
      "type": "group",
      "x": 660, "y": 340,
      "children": ["card-1", "title-1", "circle-1"]
    }
  ]
}
```

### 4.2 Element Type Quick Reference

| Type | Required Fields | Optional Fields | Notes |
|---|---|---|---|
| `rectangle` | id, type, x, y, width, height | style, rotation | Use borderRadius for rounded corners |
| `ellipse` | id, type, x, y, width, height | style, rotation | width=height for circle |
| `line` | id, type, x, y, points | style | Minimum 2 points |
| `arrow` | id, type, x, y, points | style | Like line but with arrowhead |
| `path` | id, type, x, y, points | style | Freehand / bezier |
| `text` | id, type, x, y, text | width, height, style | Wraps within width |
| `image` | id, type, x, y, width, height | style, rotation | URL in text field |
| `group` | id, type, x, y, children | | children = array of element IDs |

### 4.3 Coordinate System

```
(0,0) ────────────────────────── (1920,0)
  │                                    │
  │         Canvas (1920×1080)         │
  │                                    │
  │    (x,y)┌──────────┐              │
  │         │ element   │ height       │
  │         └──────────┘              │
  │            width                   │
(0,1080) ────────────────────── (1920,1080)
```

---

## 5. Error Handling

### 5.1 Error Categories & Strategies

```python
import time
import json
from openai import (
    OpenAI,
    APIError,
    RateLimitError,
    APIConnectionError,
    APITimeoutError,
    BadRequestError,
)

client = OpenAI(
    max_retries=3,         # SDK auto-retries 429, 5xx, timeouts
    timeout=30.0,          # 30s per request
)

class DrawingError(Exception):
    def __init__(self, message: str, retryable: bool = False):
        super().__init__(message)
        self.retryable = retryable


def generate_with_retry(user_message: str, history: list, max_attempts: int = 3):
    """Generate drawing spec with comprehensive error handling."""

    for attempt in range(max_attempts):
        try:
            response = client.responses.create(
                model="gpt-4o",
                instructions=SYSTEM_PROMPT,
                tools=[draw_tool],
                tool_choice="required",
                input=history + [{"role": "user", "content": user_message}],
                max_output_tokens=4096,
            )

            # Extract and validate spec
            for item in response.output:
                if item.type == "function_call" and item.name == "draw":
                    spec = json.loads(item.arguments)
                    validate_spec(spec)  # raises on invalid
                    return spec

            raise DrawingError("Model did not produce a draw call", retryable=True)

        # ── Rate limiting (429) ──
        # SDK auto-retries, but if exhausted:
        except RateLimitError as e:
            wait = 2 ** attempt * 5  # 5s, 10s, 20s
            if attempt < max_attempts - 1:
                time.sleep(wait)
                continue
            raise DrawingError(f"Rate limited after {max_attempts} attempts: {e}", retryable=True)

        # ── Timeout ──
        except APITimeoutError as e:
            if attempt < max_attempts - 1:
                continue  # SDK timeout, retry
            raise DrawingError(f"Request timed out: {e}", retryable=True)

        # ── Bad request (invalid input, prompt too long) ──
        except BadRequestError as e:
            raise DrawingError(f"Invalid request: {e}", retryable=False)

        # ── Connection / server errors ──
        except (APIConnectionError, APIError) as e:
            if attempt < max_attempts - 1:
                time.sleep(2 ** attempt)
                continue
            raise DrawingError(f"API error: {e}", retryable=True)

    raise DrawingError("Exhausted all retry attempts")
```

### 5.2 Spec Validation

```python
def validate_spec(spec: dict) -> None:
    """Validate a drawing spec before rendering."""

    if "canvas" not in spec or "elements" not in spec:
        raise DrawingError("Missing 'canvas' or 'elements' in spec", retryable=True)

    canvas = spec["canvas"]
    if canvas["width"] <= 0 or canvas["height"] <= 0:
        raise DrawingError("Invalid canvas dimensions", retryable=True)
    if canvas["width"] > 7680 or canvas["height"] > 4320:
        raise DrawingError("Canvas too large (max 7680x4320)", retryable=False)

    seen_ids = set()
    valid_types = {"rectangle", "ellipse", "line", "arrow", "path", "text", "image", "group"}

    for el in spec["elements"]:
        # Required fields
        if not all(k in el for k in ("id", "type", "x", "y")):
            raise DrawingError(f"Element missing required fields: {el}", retryable=True)

        # Unique IDs
        if el["id"] in seen_ids:
            raise DrawingError(f"Duplicate element ID: {el['id']}", retryable=True)
        seen_ids.add(el["id"])

        # Valid type
        if el["type"] not in valid_types:
            raise DrawingError(f"Invalid element type: {el['type']}", retryable=True)

        # Bounds check
        if not (-10000 <= el["x"] <= 10000 and -10000 <= el["y"] <= 10000):
            raise DrawingError(f"Element {el['id']} out of bounds", retryable=True)

        # Type-specific
        if el["type"] in ("line", "arrow", "path"):
            if "points" not in el or len(el.get("points", [])) < 2:
                raise DrawingError(f"{el['type']} '{el['id']}' needs ≥2 points", retryable=True)

        if el["type"] == "text" and not el.get("text"):
            raise DrawingError(f"Text element '{el['id']}' has no text content", retryable=True)

        if el["type"] == "group" and not el.get("children"):
            raise DrawingError(f"Group '{el['id']}' has no children", retryable=True)
```

### 5.3 Error Response to Frontend

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests. Retrying in 5 seconds.",
    "retryable": true,
    "retryAfterMs": 5000
  }
}
```

| Error Code | HTTP Status | Retryable | User Message |
|---|---|---|---|
| `RATE_LIMITED` | 429 | ✅ | "Busy — retrying automatically…" |
| `TIMEOUT` | 408 | ✅ | "Taking too long — trying again…" |
| `INVALID_SPEC` | 422 | ✅ | "Drawing error — regenerating…" |
| `BAD_REQUEST` | 400 | ❌ | "Could not process your request." |
| `SERVER_ERROR` | 500+ | ✅ | "OpenAI is down — retrying…" |

---

## 6. Latency Optimization

### 6.1 Prompt Engineering for Speed

```python
SYSTEM_PROMPT = """You are an AI whiteboard assistant.

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
- "card"      → white rounded rect, shadow via slight offset
"""
```

Key prompt techniques:
- **Concise instructions** — fewer input tokens → faster TTFT (time to first token)
- **Element count cap** — `max 50 elements` prevents the model from over-generating
- **Shortcut vocabulary** — pre-defined patterns reduce reasoning time
- **No chain-of-thought** — `strict: true` + `tool_choice: "required"` skips explanatory text

### 6.2 Caching Strategy

```python
import hashlib

# ── Prompt-level cache ──
spec_cache: dict[str, dict] = {}  # In production, use Redis

def get_or_generate(prompt: str, history: list) -> dict:
    cache_key = hashlib.sha256(prompt.strip().lower().encode()).hexdigest()

    if cache_key in spec_cache:
        return spec_cache[cache_key]

    spec = generate_with_retry(prompt, history)
    spec_cache[cache_key] = spec
    return spec
```

**Additional caching layers:**

| Layer | What to Cache | TTL | Benefit |
|---|---|---|---|
| **Exact prompt match** | Full spec output | 1 hour | Instant for repeated prompts |
| **Template cache** | Common patterns (flowchart, org chart) | ∞ | Skip API call entirely |
| **Element library** | Pre-built element snippets | ∞ | Inject into prompt for reuse |

### 6.3 Early Rendering of Partial Specs (Speculative Rendering)

```
Timeline (ms)
0        200       400       800      1200      1800      2400
│         │         │         │         │         │         │
├─ TTFT ──┤         │         │         │         │         │
│         ├─ el[0] ─┤         │         │         │         │
│         │  canvas │         │         │         │         │
│         │  + bg   │         │         │         │         │
│         │ RENDER  ├─ el[1] ─┤         │         │         │
│         │  ↓↓↓    │  card   │         │         │         │
│         │         │ RENDER  ├─ el[2] ─┤         │         │
│         │         │  ↓↓↓    │  title  │         │         │
│         │         │         │ RENDER  ├── ... ──┤         │
│         │         │         │  ↓↓↓    │         ├─ DONE ──┤
│         │         │         │         │         │ FINAL   │
│         │         │         │         │         │ RENDER  │
```

Each fully-parsed element is rendered immediately on the canvas. On `complete_spec`, a final validation pass reconciles any positioning adjustments.

### 6.4 Model Parameter Tuning

```python
response = client.responses.create(
    model="gpt-4o",
    tools=[draw_tool],
    tool_choice="required",
    input=history,
    instructions=SYSTEM_PROMPT,
    max_output_tokens=4096,    # Cap output — prevents runaway generation
    temperature=0.3,           # Low temp = more deterministic/faster
    top_p=0.9,                 # Slightly constrained sampling
    stream=True,
)
```

| Parameter | Value | Rationale |
|---|---|---|
| `temperature` | 0.3 | Deterministic drawing specs (less "creative" variation) |
| `top_p` | 0.9 | Marginal speed gain from narrower sampling |
| `max_output_tokens` | 4096 | Enough for ~50 elements; prevents runaway |
| `stream` | true | Always stream for perceived latency |

### 6.5 Architecture-Level Optimizations

```
┌─────────────────┐     ┌───────────────────┐     ┌──────────────┐
│  Browser/Client │────▶│  Edge Function    │────▶│  OpenAI API  │
│                 │◀────│  (Cloudflare/     │◀────│              │
│  Canvas Renderer│ SSE │   Vercel Edge)    │     │  gpt-4o      │
└─────────────────┘     └───────────────────┘     └──────────────┘
                              │
                        ┌─────▼─────┐
                        │  Redis    │
                        │  Cache    │
                        └───────────┘
```

- **Edge functions** — reduce round-trip to OpenAI by ~50-100ms
- **Connection keep-alive** — reuse HTTP/2 connections to OpenAI
- **Prompt compression** — omit old conversation turns; keep last 3 exchanges
- **Parallel tool calls** — model can call `draw()` multiple times in one response for complex scenes

---

## 7. .env Configuration

```bash
# ── Required ──
OPENAI_API_KEY=sk-proj-...                    # Your OpenAI API key

# ── Model ──
OPENAI_MODEL=gpt-4o                           # Primary model ID
OPENAI_FALLBACK_MODEL=gpt-4o-mini             # Fallback for rate limits / cost
OPENAI_REASONING_MODEL=o4-mini                # For complex layout requests

# ── Generation ──
OPENAI_MAX_OUTPUT_TOKENS=4096                  # Max tokens per response
OPENAI_TEMPERATURE=0.3                         # Low = deterministic specs
OPENAI_TOP_P=0.9                               # Sampling nucleus

# ── Reliability ──
OPENAI_MAX_RETRIES=3                           # SDK-level retries (429, 5xx)
OPENAI_TIMEOUT_SECONDS=30                      # Per-request timeout
OPENAI_STREAM=true                             # Always stream

# ── Canvas Defaults ──
CANVAS_DEFAULT_WIDTH=1920                      # Default canvas width
CANVAS_DEFAULT_HEIGHT=1080                     # Default canvas height
CANVAS_MAX_ELEMENTS=50                         # Max elements per draw() call

# ── Caching ──
REDIS_URL=redis://localhost:6379               # Spec cache backend
CACHE_TTL_SECONDS=3600                         # 1 hour default

# ── Logging ──
LOG_LEVEL=info                                 # debug | info | warn | error
LOG_OPENAI_REQUESTS=false                      # Log full request/response (CAUTION: costs)
```

### Loading Config (Python)

```python
import os
from dataclasses import dataclass, field

@dataclass
class WhiteboardConfig:
    api_key: str        = field(default_factory=lambda: os.environ["OPENAI_API_KEY"])
    model: str          = os.getenv("OPENAI_MODEL", "gpt-4o")
    fallback_model: str = os.getenv("OPENAI_FALLBACK_MODEL", "gpt-4o-mini")
    max_tokens: int     = int(os.getenv("OPENAI_MAX_OUTPUT_TOKENS", "4096"))
    temperature: float  = float(os.getenv("OPENAI_TEMPERATURE", "0.3"))
    top_p: float        = float(os.getenv("OPENAI_TOP_P", "0.9"))
    max_retries: int    = int(os.getenv("OPENAI_MAX_RETRIES", "3"))
    timeout: float      = float(os.getenv("OPENAI_TIMEOUT_SECONDS", "30"))
    stream: bool        = os.getenv("OPENAI_STREAM", "true").lower() == "true"
    canvas_width: int   = int(os.getenv("CANVAS_DEFAULT_WIDTH", "1920"))
    canvas_height: int  = int(os.getenv("CANVAS_DEFAULT_HEIGHT", "1080"))
    max_elements: int   = int(os.getenv("CANVAS_MAX_ELEMENTS", "50"))

config = WhiteboardConfig()
```

---

## Appendix A: Example Prompts & Expected Output

### Prompt: "Draw a simple flowchart: Start → Process → Decision → End"

**Expected `draw()` arguments:**

```json
{
  "canvas": { "width": 1920, "height": 1080 },
  "elements": [
    { "id": "start", "type": "ellipse", "x": 860, "y": 100, "width": 200, "height": 80,
      "style": { "fill": "#22C55E", "stroke": "#15803D", "strokeWidth": 2 } },
    { "id": "start-label", "type": "text", "x": 910, "y": 125, "width": 100, "height": 30,
      "text": "Start", "style": { "fontSize": 18, "textAlign": "center", "color": "#FFFFFF" } },
    { "id": "arrow-1", "type": "arrow", "x": 0, "y": 0,
      "points": [[960, 180], [960, 260]],
      "style": { "stroke": "#64748B", "strokeWidth": 2 } },
    { "id": "process", "type": "rectangle", "x": 810, "y": 260, "width": 300, "height": 100,
      "style": { "fill": "#3B82F6", "stroke": "#1D4ED8", "strokeWidth": 2, "borderRadius": 8 } },
    { "id": "process-label", "type": "text", "x": 860, "y": 295, "width": 200, "height": 30,
      "text": "Process", "style": { "fontSize": 18, "textAlign": "center", "color": "#FFFFFF" } },
    { "id": "arrow-2", "type": "arrow", "x": 0, "y": 0,
      "points": [[960, 360], [960, 440]],
      "style": { "stroke": "#64748B", "strokeWidth": 2 } },
    { "id": "decision", "type": "rectangle", "x": 835, "y": 440, "width": 250, "height": 120,
      "rotation": 45,
      "style": { "fill": "#F59E0B", "stroke": "#D97706", "strokeWidth": 2 } },
    { "id": "decision-label", "type": "text", "x": 885, "y": 485, "width": 150, "height": 30,
      "text": "Decision", "style": { "fontSize": 16, "textAlign": "center", "color": "#FFFFFF" } },
    { "id": "arrow-3", "type": "arrow", "x": 0, "y": 0,
      "points": [[960, 560], [960, 660]],
      "style": { "stroke": "#64748B", "strokeWidth": 2 } },
    { "id": "end", "type": "ellipse", "x": 860, "y": 660, "width": 200, "height": 80,
      "style": { "fill": "#EF4444", "stroke": "#B91C1C", "strokeWidth": 2 } },
    { "id": "end-label", "type": "text", "x": 910, "y": 685, "width": 100, "height": 30,
      "text": "End", "style": { "fontSize": 18, "textAlign": "center", "color": "#FFFFFF" } }
  ]
}
```

### Prompt: "Add a sticky note saying 'TODO: review this' at top-right"

(multi-turn — appends to existing canvas)

```json
{
  "canvas": { "width": 1920, "height": 1080 },
  "elements": [
    { "id": "sticky-1", "type": "rectangle", "x": 1600, "y": 40, "width": 280, "height": 160,
      "style": { "fill": "#FEF08A", "stroke": "#EAB308", "strokeWidth": 1, "borderRadius": 4 } },
    { "id": "sticky-1-text", "type": "text", "x": 1620, "y": 70, "width": 240, "height": 100,
      "text": "TODO: review this",
      "style": { "fontSize": 20, "fontFamily": "Inter", "fontWeight": "normal", "color": "#713F12" } }
  ]
}
```

---

## Appendix B: Vision Input (Analyzing Existing Whiteboard)

```python
def analyze_and_extend(image_base64: str, instruction: str):
    """Upload a whiteboard photo, model analyzes it and generates specs to extend it."""
    response = client.responses.create(
        model="gpt-4o",
        instructions=SYSTEM_PROMPT + "\nAnalyze the uploaded image. Identify all existing elements and positions. Then follow the user instruction to add/modify elements.",
        tools=[draw_tool],
        tool_choice="required",
        input=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_image",
                        "image_url": f"data:image/png;base64,{image_base64}",
                    },
                    {
                        "type": "input_text",
                        "text": instruction,
                    },
                ],
            }
        ],
        max_output_tokens=4096,
        stream=True,
    )
    return response
```

---

## Appendix C: Quick-Start Checklist

- [ ] Set `OPENAI_API_KEY` in `.env`
- [ ] Install SDK: `pip install openai>=1.76`
- [ ] Register the `draw` tool with `strict: true`
- [ ] Set `tool_choice: "required"` on all whiteboard requests
- [ ] Enable streaming (`stream=True`)
- [ ] Implement `try_parse_partial_elements` for progressive rendering
- [ ] Add spec validation before rendering
- [ ] Configure SDK retries (`max_retries=3`)
- [ ] Set up Redis cache for repeated prompts
- [ ] Test with vision input (whiteboard photo → spec)
