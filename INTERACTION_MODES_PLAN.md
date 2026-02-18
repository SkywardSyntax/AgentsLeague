# AI Whiteboard — Dual Interaction Modes: Technical Plan

## Table of Contents

1. [Overview](#overview)
2. [Text Mode Flow](#1-text-mode)
3. [Voice Mode Flow](#2-voice-mode)
4. [Chat UX Layout](#3-chat-ux)
5. [State Management](#4-state-management)
6. [Audio Integration](#5-audio-integration)
7. [UI Indicators](#6-ui-indicators)
8. [State Machine Diagrams](#7-state-machine-diagrams)
9. [Wireframe Descriptions](#8-wireframe-descriptions)

---

## Overview

The whiteboard supports two interaction modes — **Text** and **Voice** — unified under a single conversation model. Both modes produce the same four-phase pipeline:

```
Input → Model Response → Drawing Action → Reasoning Display
```

The user can switch modes mid-conversation without losing context.

---

## 1. Text Mode

### Flow

```
┌──────────────────────────────────────────────────────────────┐
│  User types in chat input → presses Enter / clicks Send      │
│                              │                                │
│                              ▼                                │
│                   ┌─────────────────────┐                     │
│                   │  Show user message   │                     │
│                   │  in chat timeline    │                     │
│                   └────────┬────────────┘                     │
│                            ▼                                  │
│                   ┌─────────────────────┐                     │
│                   │  Send to LLM API    │                     │
│                   │  (streaming SSE)    │                     │
│                   └────────┬────────────┘                     │
│                            ▼                                  │
│              ┌─────────────────────────────┐                  │
│              │  Stream model response text │                  │
│              │  into chat bubble           │                  │
│              └────────────┬────────────────┘                  │
│                           ▼                                   │
│              ┌─────────────────────────────┐                  │
│              │  Parse drawing commands     │                  │
│              │  from structured response   │                  │
│              └────────────┬────────────────┘                  │
│                           ▼                                   │
│              ┌─────────────────────────────┐                  │
│              │  Execute drawing on canvas  │                  │
│              │  (animated render)          │                  │
│              └────────────┬────────────────┘                  │
│                           ▼                                   │
│              ┌─────────────────────────────┐                  │
│              │  Show reasoning panel       │                  │
│              │  (collapsible, below msg)   │                  │
│              └─────────────────────────────┘                  │
└──────────────────────────────────────────────────────────────┘
```

### Message Schema (LLM → Client)

```jsonc
{
  "id": "msg_abc123",
  "type": "assistant",
  "content": {
    "text": "Here's a system architecture diagram with three services.",
    "drawing": {
      "action": "create",            // create | modify | delete | clear
      "objects": [
        {
          "type": "rect",
          "id": "obj_1",
          "x": 100, "y": 80,
          "width": 200, "height": 100,
          "label": "Auth Service",
          "style": { "fill": "#E3F2FD", "stroke": "#1565C0" }
        },
        {
          "type": "arrow",
          "id": "obj_2",
          "from": "obj_1",
          "to": "obj_3",
          "label": "JWT token"
        }
        // ...more objects
      ]
    },
    "reasoning": {
      "steps": [
        "User asked for a microservices diagram.",
        "Identified 3 core services: Auth, API Gateway, Data.",
        "Arranged left-to-right with directional arrows for data flow.",
        "Used color coding: blue = auth, green = data, orange = gateway."
      ],
      "confidence": 0.92
    }
  },
  "timestamp": "2025-01-15T10:30:00Z"
}
```

### Streaming Strategy

| Phase            | Delivery Method         | UI Behavior                                |
| ---------------- | ----------------------- | ------------------------------------------ |
| Response text    | SSE token stream        | Tokens append into chat bubble in real time |
| Drawing commands | Single JSON block       | Parsed after `[DRAW_START]...[DRAW_END]` delimiters |
| Reasoning        | Delivered after drawing | Fades in as collapsible section             |

---

## 2. Voice Mode

### Flow

```
┌──────────────────────────────────────────────────────────────────┐
│  User taps mic button (or uses push-to-talk)                     │
│                              │                                    │
│                              ▼                                    │
│                   ┌──────────────────────┐                        │
│                   │  Activate microphone  │                        │
│                   │  Show "Listening..." │                        │
│                   │  indicator + waveform │                        │
│                   └────────┬─────────────┘                        │
│                            ▼                                      │
│                   ┌──────────────────────┐                        │
│                   │  Web Speech API      │                        │
│                   │  interim results →   │                        │
│                   │  live transcription  │                        │
│                   └────────┬─────────────┘                        │
│                            ▼                                      │
│               ┌────────────────────────────┐                      │
│               │  Silence detected (1.5s)   │                      │
│               │  or user taps stop         │                      │
│               │  → finalize transcript     │                      │
│               └────────────┬───────────────┘                      │
│                            ▼                                      │
│               ┌────────────────────────────┐                      │
│               │  Display final transcript  │                      │
│               │  as user message (with 🎤) │                      │
│               └────────────┬───────────────┘                      │
│                            ▼                                      │
│               ┌────────────────────────────┐                      │
│               │  Send transcript to LLM    │                      │
│               │  (same API as text mode)   │                      │
│               └────────────┬───────────────┘                      │
│                            ▼                                      │
│       ┌────────────────────┴──────────────────────┐               │
│       │                                           │               │
│       ▼                                           ▼               │
│  ┌──────────────┐                    ┌──────────────────┐         │
│  │ Stream text   │                    │ TTS synthesis    │         │
│  │ response into │                    │ (optional, runs  │         │
│  │ chat bubble   │                    │  in parallel)    │         │
│  └──────┬───────┘                    └────────┬─────────┘         │
│         │                                     │                   │
│         ▼                                     ▼                   │
│  ┌──────────────┐                    ┌──────────────────┐         │
│  │ Parse & exec  │                    │ Play audio       │         │
│  │ drawing cmds  │                    │ response via     │         │
│  └──────┬───────┘                    │ Web Audio API    │         │
│         │                            └──────────────────┘         │
│         ▼                                                         │
│  ┌──────────────┐                                                 │
│  │ Show          │                                                 │
│  │ reasoning     │                                                 │
│  └──────────────┘                                                 │
└──────────────────────────────────────────────────────────────────┘
```

### Voice Input Modes

| Mode           | Activation                 | Deactivation                    |
| -------------- | -------------------------- | ------------------------------- |
| Push-to-talk   | Hold mic button            | Release button                  |
| Auto-detect    | Tap mic once               | 1.5s silence or tap again       |
| Continuous     | Toggle "always listening"  | Toggle off or keyword "stop"    |

Default: **Auto-detect** (tap once, silence ends turn).

### TTS Output Decision Tree

```
Voice mode active?
├── Yes
│   ├── TTS enabled in settings?
│   │   ├── Yes → Synthesize response text via TTS provider
│   │   │         Play audio, show text simultaneously
│   │   └── No  → Show text only (silent voice mode)
│   └── User preference: "read drawings aloud"?
│       ├── Yes → Also narrate: "I've drawn a rectangle labeled Auth Service..."
│       └── No  → Narrate response only, skip drawing description
└── No (text mode)
    └── No audio output
```

---

## 3. Chat UX

### Layout — Three-Panel Design

```
┌─────────────────────────────────────────────────────────────────────┐
│  TOOLBAR                                                            │
│  [Text ◉ | ○ Voice]  [Undo] [Redo] [Clear] [Export]  [Settings ⚙]  │
├──────────────────────────┬──────────────────────────────────────────┤
│                          │                                          │
│   CHAT PANEL (left)      │         CANVAS (right)                   │
│   width: 360px           │         flex: 1                          │
│                          │                                          │
│  ┌────────────────────┐  │  ┌──────────────────────────────────┐    │
│  │ 🎤 "Draw me a      │  │  │                                  │    │
│  │ system arch diagram"│  │  │     ┌──────────┐                │    │
│  │ (transcription)     │  │  │     │ Auth Svc │                │    │
│  └────────────────────┘  │  │     └────┬─────┘                │    │
│                          │  │          │                        │    │
│  ┌────────────────────┐  │  │          ▼                        │    │
│  │ 🤖 "Here's a 3-svc │  │  │     ┌──────────┐                │    │
│  │ architecture..."   │  │  │     │ Gateway  │                │    │
│  │                    │  │  │     └──────────┘                │    │
│  │ 🎨 Drawing...      │  │  │                                  │    │
│  │ ██████████░░ 75%   │  │  │                                  │    │
│  │                    │  │  └──────────────────────────────────┘    │
│  │ 💡 Reasoning  ▼    │  │                                          │
│  │ ┌────────────────┐ │  │                                          │
│  │ │ • Identified 3 │ │  │                                          │
│  │ │   services     │ │  │                                          │
│  │ │ • L-R layout   │ │  │                                          │
│  │ └────────────────┘ │  │                                          │
│  └────────────────────┘  │                                          │
│                          │                                          │
│  ┌────────────────────┐  │                                          │
│  │ Type or 🎤 speak.. │  │                                          │
│  └────────────────────┘  │                                          │
│                          │                                          │
├──────────────────────────┴──────────────────────────────────────────┤
│  STATUS BAR:  ● Connected  |  Objects: 5  |  Mode: Voice (listening)│
└─────────────────────────────────────────────────────────────────────┘
```

### Chat Bubble Types

| Bubble Type         | Visual                    | Content                                      |
| ------------------- | ------------------------- | -------------------------------------------- |
| User text           | Right-aligned, blue bg    | Typed message                                |
| User voice          | Right-aligned, blue bg    | 🎤 icon + transcribed text + "Transcribed" tag |
| Model response      | Left-aligned, gray bg     | Streamed text response                       |
| Drawing indicator   | Left-aligned, inline card | 🎨 "Drawing..." + progress bar + object count |
| Reasoning           | Collapsible sub-section   | 💡 Expandable list of reasoning steps         |
| Error               | Left-aligned, red border  | Error description + retry button             |

### Drawing Indicator Detail

When the model returns drawing commands, show an inline card:

```
┌─────────────────────────────────────────┐
│  🎨  Drawing 3 objects...               │
│  ██████████████░░░░░░  70%              │
│                                         │
│  ✓ rect "Auth Service"                  │
│  ✓ rect "API Gateway"                   │
│  ◌ arrow "JWT flow"                     │
│                                         │
│  [View on canvas →]                     │
└─────────────────────────────────────────┘
```

After completion, this collapses to:

```
🎨 Drew 3 objects  [View on canvas →]
```

### Reasoning Panel

```
┌─────────────────────────────────────────┐
│  💡 Reasoning                    [▼/▲]  │
├─────────────────────────────────────────┤
│  1. User asked for a microservices      │
│     architecture diagram.               │
│  2. Identified three core services      │
│     from context: Auth, Gateway, Data.  │
│  3. Chose left-to-right layout for      │
│     readability of data flow.           │
│  4. Applied color coding:               │
│     blue=auth, green=data, orange=gw.   │
│                                         │
│  Confidence: ████████░░ 92%             │
└─────────────────────────────────────────┘
```

Default state: **collapsed** (shows "💡 Reasoning ▼" as a single clickable line).

---

## 4. State Management

### Top-Level State Tree

```typescript
interface AppState {
  // Interaction mode
  mode: {
    current: 'text' | 'voice';
    voice: {
      inputMode: 'push-to-talk' | 'auto-detect' | 'continuous';
      ttsEnabled: boolean;
      isListening: boolean;
      interimTranscript: string;
      finalTranscript: string;
    };
  };

  // Conversation
  conversation: {
    messages: Message[];
    isStreaming: boolean;
    streamBuffer: string;
    pendingDrawCommands: DrawCommand[] | null;
  };

  // Canvas / Drawing
  canvas: {
    objects: CanvasObject[];
    selectedObjectIds: string[];
    history: CanvasSnapshot[];      // undo/redo stack
    historyIndex: number;
    isAnimating: boolean;           // true while drawing commands execute
    viewport: { x: number; y: number; zoom: number };
  };

  // Pipeline phase tracking
  pipeline: {
    phase: 'idle'
      | 'listening'         // voice: mic active
      | 'transcribing'      // voice: finalizing transcript
      | 'sending'           // request sent, awaiting first token
      | 'streaming_text'    // receiving model text
      | 'parsing_draw'      // extracting draw commands
      | 'drawing'           // rendering to canvas
      | 'speaking'          // TTS playback
      | 'complete'
      | 'error';
    error: string | null;
    drawProgress: { completed: number; total: number } | null;
  };

  // UI preferences
  ui: {
    chatPanelWidth: number;
    reasoningExpanded: Record<string, boolean>;  // per-message
    theme: 'light' | 'dark';
  };
}
```

### Message Types

```typescript
interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  timestamp: number;
  source: 'text' | 'voice';

  // Content phases (populated progressively)
  text: string;
  drawing: DrawingSpec | null;
  reasoning: ReasoningData | null;

  // Metadata
  meta: {
    voiceTranscriptConfidence?: number;  // 0-1 for STT confidence
    ttsAudioUrl?: string;                // cached TTS audio
    drawObjectIds?: string[];            // IDs of objects created/modified
    streamComplete: boolean;
  };
}

interface DrawingSpec {
  action: 'create' | 'modify' | 'delete' | 'clear';
  objects: DrawObject[];
}

interface DrawObject {
  type: 'rect' | 'ellipse' | 'line' | 'arrow' | 'text' | 'freeform' | 'group';
  id: string;
  props: Record<string, any>;    // position, size, style, label, etc.
}

interface ReasoningData {
  steps: string[];
  confidence: number;
}
```

### State Machine — Pipeline Phases

```
                      ┌────────────────────────────────┐
                      │                                │
                      ▼                                │
                  ┌───────┐                            │
         ┌───────│ IDLE   │───────┐                    │
         │       └───────┘       │                    │
    (type Enter)           (tap mic)                  │
         │                       │                    │
         ▼                       ▼                    │
   ┌──────────┐          ┌────────────┐               │
   │ SENDING  │          │ LISTENING  │               │
   └────┬─────┘          └─────┬──────┘               │
        │                      │                      │
        │               (silence / stop)              │
        │                      │                      │
        │                      ▼                      │
        │              ┌──────────────┐               │
        │              │ TRANSCRIBING │               │
        │              └──────┬───────┘               │
        │                     │                       │
        │              (transcript ready)             │
        │                     │                       │
        │                     ▼                       │
        │               ┌──────────┐                  │
        └──────────────►│ SENDING  │                  │
                        └────┬─────┘                  │
                             │                        │
                      (first token)                   │
                             │                        │
                             ▼                        │
                    ┌────────────────┐                 │
                    │ STREAMING_TEXT │                 │
                    └───────┬───────┘                 │
                            │                         │
                     (draw delimiter)                 │
                            │                         │
                            ▼                         │
                    ┌──────────────┐                   │
                    │ PARSING_DRAW │                   │
                    └──────┬───────┘                   │
                           │                          │
                    (commands parsed)                  │
                           │                          │
                           ▼                          │
                    ┌──────────┐     (TTS in parallel) │
                    │ DRAWING  │────────────┐          │
                    └────┬─────┘            ▼          │
                         │          ┌──────────┐       │
                         │          │ SPEAKING │       │
                         │          └────┬─────┘       │
                         │               │             │
                  (draw done)      (audio done)        │
                         │               │             │
                         ▼               │             │
                    ┌──────────┐         │             │
                    │ COMPLETE │◄────────┘             │
                    └────┬─────┘                       │
                         │                             │
                         └─────────────────────────────┘
                         (auto-return to IDLE after 500ms)

  Any state ──(error)──► ERROR ──(dismiss/retry)──► IDLE
```

### Conversation History for LLM Context

```typescript
function buildLLMContext(messages: Message[]): LLMMessage[] {
  return messages.map(m => ({
    role: m.role,
    content: m.role === 'user'
      ? m.text
      : [
          m.text,
          m.drawing ? `[DRAWING: ${m.drawing.objects.length} objects]` : '',
        ].filter(Boolean).join('\n'),
  }));
}
```

The full drawing spec is **not** re-sent in conversation history to save tokens. Instead, a summary is included, and the current canvas state is sent as a system message when relevant:

```typescript
function canvasContextMessage(canvas: CanvasState): LLMMessage {
  return {
    role: 'system',
    content: `Current canvas objects:\n${
      canvas.objects.map(o => `- ${o.id}: ${o.type} "${o.props.label || ''}" at (${o.props.x},${o.props.y})`).join('\n')
    }`,
  };
}
```

---

## 5. Audio Integration

### Speech-to-Text (STT)

**Primary: Web Speech API** (`webkitSpeechRecognition` / `SpeechRecognition`)

```typescript
class VoiceInput {
  private recognition: SpeechRecognition;
  private onInterim: (text: string) => void;
  private onFinal: (text: string, confidence: number) => void;

  constructor(callbacks: { onInterim; onFinal; onError }) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new SR();
    this.recognition.continuous = false;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';

    this.recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      let final = '';
      let confidence = 0;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
          confidence = result[0].confidence;
        } else {
          interim += result[0].transcript;
        }
      }

      if (interim) callbacks.onInterim(interim);
      if (final) callbacks.onFinal(final, confidence);
    };

    this.recognition.onerror = (e) => callbacks.onError(e.error);
  }

  start() { this.recognition.start(); }
  stop()  { this.recognition.stop(); }
  abort() { this.recognition.abort(); }
}
```

**Fallback: OpenAI Whisper API** (for browsers without Web Speech API, or higher accuracy needs)

```typescript
async function whisperTranscribe(audioBlob: Blob): Promise<{ text: string; confidence: number }> {
  const form = new FormData();
  form.append('file', audioBlob, 'audio.webm');
  form.append('model', 'whisper-1');
  form.append('response_format', 'verbose_json');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}` },
    body: form,
  });

  const data = await res.json();
  return { text: data.text, confidence: data.segments?.[0]?.avg_logprob ?? 0.9 };
}
```

### Text-to-Speech (TTS)

**Option A: OpenAI TTS** (recommended for simplicity)

```typescript
async function synthesizeSpeech(text: string): Promise<ArrayBuffer> {
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'tts-1',           // or 'tts-1-hd' for higher quality
      voice: 'nova',            // alloy | echo | fable | onyx | nova | shimmer
      input: text,
      speed: 1.0,
    }),
  });
  return res.arrayBuffer();
}
```

**Option B: ElevenLabs** (for more natural voices / voice cloning)

```typescript
async function elevenLabsTTS(text: string, voiceId: string): Promise<ArrayBuffer> {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    }
  );
  return res.arrayBuffer();
}
```

**Option C: Browser-native TTS** (zero-cost fallback)

```typescript
function browserTTS(text: string): void {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  speechSynthesis.speak(utterance);
}
```

### Audio Playback Pipeline

```typescript
class AudioPlayer {
  private ctx: AudioContext;
  private queue: ArrayBuffer[] = [];
  private playing = false;

  constructor() {
    this.ctx = new AudioContext();
  }

  async enqueue(audioData: ArrayBuffer) {
    this.queue.push(audioData);
    if (!this.playing) this.playNext();
  }

  private async playNext() {
    if (this.queue.length === 0) { this.playing = false; return; }
    this.playing = true;

    const buffer = await this.ctx.decodeAudioData(this.queue.shift()!);
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.ctx.destination);
    source.onended = () => this.playNext();
    source.start();
  }

  stop() {
    this.queue = [];
    this.playing = false;
    this.ctx.close();
    this.ctx = new AudioContext();
  }
}
```

### Latency Budget

```
┌────────────────────────────────────────────────────────────────┐
│  Operation                    Target     Budget    Strategy    │
├────────────────────────────────────────────────────────────────┤
│  Voice → interim transcript   <300ms     real-time  browser   │
│  Final transcript             <500ms     on-device  browser   │
│  Whisper fallback             <2s        API call   stream    │
│  LLM first token (text)      <800ms     API call   SSE       │
│  LLM full response           <5s        API call   stream    │
│  Draw command parse           <50ms      client     sync      │
│  Canvas render (per object)   <100ms     client     rAF       │
│  TTS synthesis (OpenAI)       <1.5s      API call   stream    │
│  TTS synthesis (ElevenLabs)   <1s        API call   stream    │
│  TTS playback start           <200ms     client     Web Audio │
│  Total voice round-trip       <4s        end-to-end parallel  │
└────────────────────────────────────────────────────────────────┘
```

**Parallelization strategy:**

```
Timeline (voice mode with TTS):

t=0        User stops speaking
t=0.3s     Transcript finalized → sent to LLM
t=0.3s     ──────── LLM streaming begins ────────
t=1.0s     First text chunk arrives → display
t=1.0s     ──── TTS chunk 1 synthesis starts ────
t=2.5s     Draw commands parsed → canvas render starts
t=2.5s     ──── TTS chunk 1 playback starts ──────
t=3.5s     Canvas render complete
t=4.0s     TTS playback complete
t=4.0s     Reasoning panel shown
```

Key: TTS is synthesized **per-sentence** in parallel with streaming, not after full response.

---

## 6. UI Indicators

### Visual Feedback States

#### Microphone Button States

```
┌──────────────────────────────────────────────────────┐
│  State          │  Visual                            │
├──────────────────────────────────────────────────────┤
│  Idle           │  🎤 Gray outline, static           │
│  Listening      │  🎤 Red fill, pulsing ring anim    │
│  Processing     │  ⏳ Spinner replaces mic icon       │
│  Disabled       │  🎤 Grayed out, strikethrough      │
│  Error          │  ⚠️  Red icon, tooltip with error   │
└──────────────────────────────────────────────────────┘
```

#### Waveform Visualizer (Voice Mode)

When listening, show a real-time audio waveform above the input area:

```
         ┌──────────────────────────────────┐
         │   ▁▂▃▅▇▅▃▂▁▂▄▆▇▆▄▂▁▁▂▃▅▃▂▁     │
         │          Listening...             │
         └──────────────────────────────────┘
```

Implementation: AnalyserNode from Web Audio API → canvas/SVG rendering at 30fps.

#### Processing Indicator

```
         ┌──────────────────────────────────┐
         │   ◉ ◉ ◉   Thinking...           │
         │   (animated bouncing dots)        │
         └──────────────────────────────────┘
```

Shown between sending request and first token arriving.

#### Drawing Progress

```
         ┌──────────────────────────────────┐
         │  🎨 Drawing...                    │
         │  ████████░░░░░░░░  3/6 objects    │
         │                                   │
         │  Canvas highlights active object  │
         │  with blue glow during placement  │
         └──────────────────────────────────┘
```

Each object animates onto the canvas (fade-in + scale from 0.8→1.0, 200ms ease-out).

#### Mode Toggle

```
  ┌────────────────────────────────┐
  │  ┌────────┬──────────┐        │
  │  │  Text  │  🎤 Voice │        │
  │  │  ◉     │          │        │
  │  └────────┴──────────┘        │
  │  Segmented control, top-left  │
  └────────────────────────────────┘
```

When switching modes:
- Text → Voice: Mic button appears, input placeholder changes to "Tap to speak..."
- Voice → Text: Mic deactivates, input placeholder changes to "Type a message..."

#### TTS Playback Indicator

```
  ┌────────────────────────────────┐
  │  🔊 ▶ ████████░░░░  0:03/0:08 │
  │     [⏸ Pause]  [⏹ Stop]       │
  └────────────────────────────────┘
```

Appears inline in the assistant message bubble during TTS playback. User can pause/stop.

#### Connection / Status Bar

```
  ┌──────────────────────────────────────────────────────────┐
  │  ● Connected  │  Canvas: 5 objects  │  🎤 Voice (idle)   │
  └──────────────────────────────────────────────────────────┘
```

Status bar at bottom shows: connection state, canvas object count, current mode + sub-state.

---

## 7. State Machine Diagrams

### Mode Switching State Machine

```
                    ┌──────────┐
                    │  TEXT     │
                    │  MODE    │
                    └────┬─────┘
                         │
              (user toggles to voice)
                         │
                         ▼
              ┌─────────────────────┐
              │  Check mic          │
              │  permissions        │
              └──────┬──────────────┘
                     │
            ┌────────┴────────┐
            │                 │
         granted           denied
            │                 │
            ▼                 ▼
     ┌──────────┐    ┌────────────────┐
     │  VOICE   │    │  Show          │
     │  MODE    │    │  permission    │
     └──────────┘    │  prompt; stay  │
                     │  in text mode  │
                     └────────────────┘
```

### Voice Session State Machine

```
                  ┌──────────┐
           ┌─────│  V_IDLE  │◄─────────────────────────┐
           │     └──────────┘                           │
      (tap mic)                                    (complete)
           │                                            │
           ▼                                            │
     ┌────────────┐   (interim)   ┌──────────────┐     │
     │ V_LISTENING│──────────────►│ V_LIVE_TEXT  │     │
     │            │◄──────────────│ (shows text) │     │
     └─────┬──────┘   (more audio)└──────────────┘     │
           │                                            │
      (silence 1.5s                                     │
       or tap stop)                                     │
           │                                            │
           ▼                                            │
     ┌──────────────┐                                   │
     │ V_FINALIZING │──► emit final transcript          │
     └──────┬───────┘                                   │
            │                                           │
            ▼                                           │
     ┌──────────────┐                                   │
     │ V_PROCESSING │──► same as text mode pipeline ────┘
     └──────────────┘
```

### Drawing Execution State Machine

```
     ┌────────────┐
     │  D_IDLE    │
     └─────┬──────┘
           │
    (draw commands received)
           │
           ▼
     ┌────────────────┐
     │ D_VALIDATING   │──► validate object schemas
     └───────┬────────┘
             │
        (valid)  (invalid → D_ERROR → show in chat)
             │
             ▼
     ┌────────────────┐
     │ D_ANIMATING    │──► for each object:
     │                │      1. Create canvas element
     │                │      2. Animate entrance (200ms)
     │                │      3. Update progress (n/total)
     └───────┬────────┘
             │
       (all objects placed)
             │
             ▼
     ┌────────────────┐
     │ D_SAVING       │──► push to undo history
     └───────┬────────┘
             │
             ▼
     ┌────────────────┐
     │  D_IDLE        │
     └────────────────┘
```

---

## 8. Wireframe Descriptions

### Wireframe 1: Text Mode — Default State

```
┌─────────────────────────────────────────────────────────────────────────┐
│  🖊️ AgentsLeague Whiteboard       [Text ◉|○ Voice]  [⚙ Settings]       │
├───────────────────────────┬─────────────────────────────────────────────┤
│                           │                                             │
│  Chat                     │  Canvas                                     │
│                           │                                             │
│  (empty state)            │  (empty state)                              │
│                           │                                             │
│  ┌───────────────────┐    │  ┌─────────────────────────────────────┐    │
│  │  💬 Start by       │    │  │                                     │    │
│  │  describing what   │    │  │     "Describe what you'd like       │    │
│  │  you'd like to     │    │  │      to draw, and I'll create       │    │
│  │  draw!             │    │  │      it on this canvas."            │    │
│  └───────────────────┘    │  │                                     │    │
│                           │  └─────────────────────────────────────┘    │
│                           │                                             │
│                           │                                             │
│                           │                                             │
│                           │                                             │
│  ┌───────────────────┐    │                                             │
│  │ Type a message...  │🔼│                                             │
│  └───────────────────┘    │                                             │
├───────────────────────────┴─────────────────────────────────────────────┤
│  ● Connected  │  Canvas: 0 objects  │  Mode: Text                       │
└─────────────────────────────────────────────────────────────────────────┘
```

### Wireframe 2: Voice Mode — Listening

```
┌─────────────────────────────────────────────────────────────────────────┐
│  🖊️ AgentsLeague Whiteboard       [○ Text|Voice ◉]  [⚙ Settings]       │
├───────────────────────────┬─────────────────────────────────────────────┤
│                           │                                             │
│  Chat                     │  Canvas                                     │
│                           │                                             │
│  🎤 "Draw a flowchart     │  ┌─────────────────────────────────────┐    │
│  showing user..."         │  │                                     │    │
│  (interim — gray italic)  │  │         (previous drawings)         │    │
│                           │  │                                     │    │
│                           │  └─────────────────────────────────────┘    │
│                           │                                             │
│                           │                                             │
│                           │                                             │
│  ┌───────────────────────────┐                                          │
│  │  ▁▂▃▅▇▅▃▂▁▂▄▆▇▆▄▂▁       │                                          │
│  │       🔴 Listening...      │                                          │
│  │                           │                                          │
│  │  [⏹ Stop]                 │                                          │
│  └───────────────────────────┘                                          │
├───────────────────────────┴─────────────────────────────────────────────┤
│  ● Connected  │  Canvas: 3 objects  │  🎤 Voice (listening)             │
└─────────────────────────────────────────────────────────────────────────┘
```

### Wireframe 3: Processing + Drawing In Progress

```
┌─────────────────────────────────────────────────────────────────────────┐
│  🖊️ AgentsLeague Whiteboard       [○ Text|Voice ◉]  [⚙ Settings]       │
├───────────────────────────┬─────────────────────────────────────────────┤
│                           │                                             │
│  Chat                     │  Canvas                                     │
│                           │                                             │
│  🎤 "Draw a flowchart     │  ┌─────────────────────────────────────┐    │
│  showing user login flow" │  │                                     │    │
│  (final — solid text)     │  │    ┌──────────┐                     │    │
│                           │  │    │  Start   │                     │    │
│  🤖 "I'll create a user   │  │    └────┬─────┘                     │    │
│  login flowchart with     │  │         │                           │    │
│  5 steps: credential      │  │         ▼                           │    │
│  entry, validation,       │  │    ┌──────────┐   ← ✨ animating   │    │
│  2FA check, session       │  │    │ Validate │      in with glow  │    │
│  creation, and redirect." │  │    └──────────┘                     │    │
│                           │  │                                     │    │
│  🎨 Drawing 5 objects...  │  └─────────────────────────────────────┘    │
│  ████████░░░░░░  2/5      │                                             │
│                           │                                             │
│  🔊 ▶ ██░░░░░  0:02/0:06 │                                             │
│                           │                                             │
│  ┌───────────────────┐    │                                             │
│  │ Tap 🎤 to speak.. │    │                                             │
│  └───────────────────┘    │                                             │
├───────────────────────────┴─────────────────────────────────────────────┤
│  ● Connected  │  Canvas: 5 objects  │  🎤 Voice (speaking)              │
└─────────────────────────────────────────────────────────────────────────┘
```

### Wireframe 4: Complete State with Reasoning Expanded

```
┌─────────────────────────────────────────────────────────────────────────┐
│  🖊️ AgentsLeague Whiteboard       [○ Text|Voice ◉]  [⚙ Settings]       │
├───────────────────────────┬─────────────────────────────────────────────┤
│                           │                                             │
│  Chat                     │  Canvas                                     │
│                           │                                             │
│  🎤 "Draw a flowchart     │  ┌─────────────────────────────────────┐    │
│  showing user login flow" │  │                                     │    │
│                           │  │    ┌──────────┐                     │    │
│  🤖 "I've created a       │  │    │  Start   │                     │    │
│  user login flowchart..." │  │    └────┬─────┘                     │    │
│                           │  │         ▼                           │    │
│  🎨 Drew 5 objects  [→]   │  │    ┌──────────┐     ┌─────────┐    │    │
│                           │  │    │ Validate │────►│  2FA    │    │    │
│  💡 Reasoning ▲           │  │    └──────────┘     └────┬────┘    │    │
│  ┌───────────────────┐    │  │                          │         │    │
│  │ 1. User wants a   │    │  │                          ▼         │    │
│  │    login flow      │    │  │                     ┌─────────┐   │    │
│  │ 2. Standard auth   │    │  │                     │ Session │   │    │
│  │    has 5 steps     │    │  │                     └────┬────┘   │    │
│  │ 3. Top-to-bottom   │    │  │                          │        │    │
│  │    layout chosen   │    │  │                          ▼        │    │
│  │ 4. Diamond for     │    │  │                     ┌─────────┐   │    │
│  │    2FA decision    │    │  │                     │Redirect │   │    │
│  │ Confidence: 94%    │    │  │                     └─────────┘   │    │
│  └───────────────────┘    │  └─────────────────────────────────────┘    │
│                           │                                             │
│  ┌───────────────────┐    │                                             │
│  │ Tap 🎤 to speak.. │    │                                             │
│  └───────────────────┘    │                                             │
├───────────────────────────┴─────────────────────────────────────────────┤
│  ● Connected  │  Canvas: 5 objects  │  🎤 Voice (idle)                  │
└─────────────────────────────────────────────────────────────────────────┘
```

### Wireframe 5: Settings Panel (Audio Configuration)

```
┌──────────────────────────────────────┐
│  ⚙ Settings                    [✕]  │
├──────────────────────────────────────┤
│                                      │
│  Voice Input                         │
│  ┌──────────────────────────────┐    │
│  │ Mode: [Auto-detect     ▼]   │    │
│  │ Language: [English (US) ▼]   │    │
│  │ Silence timeout: [1.5s  ▼]   │    │
│  │ Engine: [Browser ◉|○ Whisper]│    │
│  └──────────────────────────────┘    │
│                                      │
│  Voice Output (TTS)                  │
│  ┌──────────────────────────────┐    │
│  │ Enabled: [◉ On | ○ Off]     │    │
│  │ Provider: [OpenAI      ▼]   │    │
│  │ Voice: [Nova           ▼]   │    │
│  │ Speed: [1.0x           ▼]   │    │
│  │ Read drawings: [○ Yes|◉ No] │    │
│  └──────────────────────────────┘    │
│                                      │
│  Canvas                              │
│  ┌──────────────────────────────┐    │
│  │ Animation speed: [Normal ▼]  │    │
│  │ Show reasoning: [◉ Yes|○ No] │    │
│  │ Auto-expand reasoning: [No]  │    │
│  └──────────────────────────────┘    │
│                                      │
│  [Save]  [Reset to defaults]         │
└──────────────────────────────────────┘
```

---

## Appendix: Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| STT engine | Web Speech API (primary) + Whisper (fallback) | Zero cost for most users; Whisper for accuracy-critical or unsupported browsers |
| TTS engine | OpenAI TTS (default) | Good quality, simple API, same vendor as LLM; ElevenLabs as premium option |
| Drawing format | Structured JSON in delimited blocks | Reliable parsing vs. free-form text; supports validation and progress tracking |
| Streaming | SSE with delimiter-based draw extraction | Low latency for text; clean separation of text vs. drawing content |
| State management | Single store (Zustand/Redux pattern) | Predictable state transitions; easy undo/redo with snapshot history |
| Reasoning display | Collapsed by default | Reduces cognitive load; power users can expand; always accessible |
| TTS chunking | Per-sentence | Reduces time-to-first-audio; allows parallel synthesis + streaming |
| Canvas animations | 200ms ease-out per object | Fast enough to not block; visible enough to track what changed |
| Mode switching | Instant, preserves full conversation | No context loss; user can mix text and voice freely |
