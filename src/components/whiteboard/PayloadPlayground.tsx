'use client';

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { DrawBatch, DrawElement } from '@/types/agent';
import { DrawBatchSchema } from '@/lib/schema';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ScrollArea } from '@/components/ui/ScrollArea';

/* ── Preset payloads ─────────────────────────────────────────────────────── */

const PRESETS: Record<string, { label: string; payload: DrawBatch }> = {
  circle: {
    label: 'Circle',
    payload: {
      batch_id: `preset-circle-${Date.now().toString(36)}`,
      style_preset: 'clean_pen_sketch',
      elements: [
        { id: 'p-circle-1', type: 'ellipse', cx: 400, cy: 300, rx: 80, ry: 80, color: '#4F6BFF', stroke_width: 2 },
      ] as DrawElement[],
    },
  },
  triangle: {
    label: 'Triangle',
    payload: {
      batch_id: `preset-triangle-${Date.now().toString(36)}`,
      style_preset: 'clean_pen_sketch',
      elements: [
        { id: 'p-tri-1', type: 'line', from: { x: 300, y: 400 }, to: { x: 500, y: 400 }, color: '#00D9A3', stroke_width: 2 },
        { id: 'p-tri-2', type: 'line', from: { x: 500, y: 400 }, to: { x: 400, y: 250 }, color: '#00D9A3', stroke_width: 2 },
        { id: 'p-tri-3', type: 'line', from: { x: 400, y: 250 }, to: { x: 300, y: 400 }, color: '#00D9A3', stroke_width: 2 },
      ] as DrawElement[],
    },
  },
  text: {
    label: 'Text',
    payload: {
      batch_id: `preset-text-${Date.now().toString(36)}`,
      style_preset: 'clean_pen_sketch',
      elements: [
        { id: 'p-text-1', type: 'text', x: 300, y: 300, text: 'Hello AgentsLeague', size: 24, color: '#F0EFF8' },
      ] as DrawElement[],
    },
  },
  graph: {
    label: 'Graph',
    payload: {
      batch_id: `preset-graph-${Date.now().toString(36)}`,
      style_preset: 'clean_pen_sketch',
      elements: [
        { id: 'p-graph-ax', type: 'arrow', from: { x: 100, y: 400 }, to: { x: 700, y: 400 }, color: '#9899B0', stroke_width: 1 },
        { id: 'p-graph-ay', type: 'arrow', from: { x: 100, y: 400 }, to: { x: 100, y: 50 }, color: '#9899B0', stroke_width: 1 },
        { id: 'p-graph-xl', type: 'text', x: 710, y: 395, text: 'x', size: 14, color: '#9899B0' },
        { id: 'p-graph-yl', type: 'text', x: 85, y: 40, text: 'y', size: 14, color: '#9899B0' },
      ] as DrawElement[],
    },
  },
};

/* ── Syntax highlighting (simple CSS class approach) ─────────────────────── */

function highlightJson(json: string): string {
  return json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"([^"\\]*(\\.[^"\\]*)*)"\s*:/g, '<span class="json-key">"$1"</span>:')
    .replace(/:\s*"([^"\\]*(\\.[^"\\]*)*)"/g, ': <span class="json-string">"$1"</span>')
    .replace(/:\s*(-?\d+\.?\d*)/g, ': <span class="json-number">$1</span>')
    .replace(/:\s*(true|false)/g, ': <span class="json-boolean">$1</span>')
    .replace(/:\s*(null)/g, ': <span class="json-null">$1</span>');
}

/* ── Mini Preview ────────────────────────────────────────────────────────── */

function MiniPreview({
  elements,
  scanning,
}: {
  elements: DrawElement[];
  scanning: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Draw grid
    ctx.strokeStyle = 'rgba(100,116,139,0.08)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 20) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 20) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Scale down to fit preview
    const scale = Math.min(w / 1000, h / 750);
    ctx.save();
    ctx.scale(scale, scale);

    for (const el of elements) {
      ctx.strokeStyle = el.color ?? '#4F6BFF';
      ctx.fillStyle = el.color ?? '#4F6BFF';
      ctx.lineWidth = (el.stroke_width ?? 2) / scale;

      switch (el.type) {
        case 'ellipse': {
          const e = el as DrawElement & { cx: number; cy: number; rx: number; ry: number };
          ctx.beginPath();
          ctx.ellipse(e.cx, e.cy, e.rx, e.ry, 0, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
        case 'rect': {
          const r = el as DrawElement & { x: number; y: number; w: number; h: number };
          ctx.strokeRect(r.x, r.y, r.w, r.h);
          break;
        }
        case 'line':
        case 'arrow': {
          const l = el as DrawElement & { from: { x: number; y: number }; to: { x: number; y: number } };
          ctx.beginPath();
          ctx.moveTo(l.from.x, l.from.y);
          ctx.lineTo(l.to.x, l.to.y);
          ctx.stroke();
          if (el.type === 'arrow') {
            const dx = l.to.x - l.from.x;
            const dy = l.to.y - l.from.y;
            const angle = Math.atan2(dy, dx);
            const headLen = 10 / scale;
            ctx.beginPath();
            ctx.moveTo(l.to.x, l.to.y);
            ctx.lineTo(l.to.x - headLen * Math.cos(angle - 0.4), l.to.y - headLen * Math.sin(angle - 0.4));
            ctx.moveTo(l.to.x, l.to.y);
            ctx.lineTo(l.to.x - headLen * Math.cos(angle + 0.4), l.to.y - headLen * Math.sin(angle + 0.4));
            ctx.stroke();
          }
          break;
        }
        case 'text': {
          const t = el as DrawElement & { x: number; y: number; text: string; size?: number };
          ctx.font = `${t.size ?? 14}px "Plus Jakarta Sans", sans-serif`;
          ctx.fillText(t.text, t.x, t.y + (t.size ?? 14));
          break;
        }
      }
    }
    ctx.restore();
  }, [elements]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg bg-[var(--color-surface)] canvas-frame">
      <canvas
        ref={canvasRef}
        width={300}
        height={240}
        className="h-full w-full"
        style={{ imageRendering: 'auto' }}
      />
      {scanning && <div className="scan-line-effect" />}
      {elements.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-[11px] text-[var(--color-text-muted)]">
          Preview
        </div>
      )}
    </div>
  );
}

/* ── API Docs Tab ────────────────────────────────────────────────────────── */

function ApiDocsTab() {
  const [copiedCurl, setCopiedCurl] = useState(false);
  const [copiedJs, setCopiedJs] = useState(false);

  const curlExample = `curl -X POST http://localhost:3000/api/whiteboard/inject \\
  -H "Content-Type: application/json" \\
  -H "X-Session-Id: my-session" \\
  -d '{
    "batch_id": "my-batch-001",
    "style_preset": "clean_pen_sketch",
    "elements": [
      {
        "id": "circle-1",
        "type": "ellipse",
        "cx": 400, "cy": 300,
        "rx": 100, "ry": 100,
        "color": "#4F6BFF"
      }
    ]
  }'`;

  const jsExample = `const res = await fetch('/api/whiteboard/inject', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Session-Id': 'my-session',
  },
  body: JSON.stringify({
    batch_id: 'my-batch-001',
    style_preset: 'clean_pen_sketch',
    elements: [{
      id: 'circle-1',
      type: 'ellipse',
      cx: 400, cy: 300,
      rx: 100, ry: 100,
      color: '#4F6BFF',
    }],
  }),
});
const data = await res.json();`;

  const copyToClipboard = useCallback(async (text: string, setter: (v: boolean) => void) => {
    try {
      await navigator.clipboard.writeText(text);
      setter(true);
      setTimeout(() => setter(false), 2000);
    } catch { /* clipboard not available */ }
  }, []);

  return (
    <ScrollArea className="h-full p-4">
      <div className="space-y-6">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-[var(--color-text-primary)]" style={{ fontFamily: 'var(--font-display)' }}>
            POST /api/whiteboard/inject
          </h3>
          <p className="text-xs text-[var(--color-text-secondary)]">
            Inject a draw batch into the whiteboard canvas. Supports both{' '}
            <code className="rounded bg-[var(--color-surface-raised)] px-1 py-0.5 text-[var(--color-mint)]">DrawBatch</code>{' '}
            and{' '}
            <code className="rounded bg-[var(--color-surface-raised)] px-1 py-0.5 text-[var(--color-mint)]">SemanticBatch</code>{' '}
            payloads.
          </p>
        </div>

        <div>
          <h4 className="mb-1.5 text-xs font-semibold text-[var(--color-text-secondary)]">Request Headers</h4>
          <div className="space-y-1 rounded-lg bg-[var(--color-surface)] p-3 text-xs">
            <div><code className="text-[var(--color-mint)]">Content-Type</code>: <code>application/json</code> <Badge variant="danger">required</Badge></div>
            <div><code className="text-[var(--color-mint)]">X-Session-Id</code>: <code>string</code> <Badge>optional</Badge></div>
            <div><code className="text-[var(--color-mint)]">Idempotency-Key</code>: <code>string</code> <Badge>optional</Badge></div>
          </div>
        </div>

        <div>
          <h4 className="mb-1.5 text-xs font-semibold text-[var(--color-text-secondary)]">Request Body (DrawBatch)</h4>
          <pre className="rounded-lg bg-[var(--color-code-bg)] p-3 text-xs text-[var(--color-code-text)] overflow-x-auto" style={{ fontFamily: 'var(--font-mono)' }}>
{`{
  "batch_id": string,          // unique batch identifier
  "style_preset": "clean_pen_sketch" | "rough_sketch" | "blueprint_neat" | "mathematical",
  "elements": [                // array of DrawElement
    {
      "id": string,            // unique element ID
      "type": "rect" | "ellipse" | "line" | "arrow" | "text" | "latex" | "clear" | ...,
      "color?": string,        // hex color
      "stroke_width?": number, // line thickness
      // ...type-specific fields
    }
  ]
}`}
          </pre>
        </div>

        <div>
          <h4 className="mb-1.5 text-xs font-semibold text-[var(--color-text-secondary)]">Element Types</h4>
          <div className="grid grid-cols-2 gap-1 text-xs text-[var(--color-text-secondary)]">
            {['rect', 'ellipse', 'line', 'arrow', 'text', 'latex', 'clear', 'cartesian_axes', 'function_curve', 'number_line', 'vector_arrow', 'matrix_bracket', 'angle_arc', 'integral_region'].map((t) => (
              <code key={t} className="rounded bg-[var(--color-surface)] px-1.5 py-0.5 text-[var(--color-mint)]" style={{ fontFamily: 'var(--font-mono)' }}>{t}</code>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <h4 className="text-xs font-semibold text-[var(--color-text-secondary)]">cURL Example</h4>
            <button
              onClick={() => copyToClipboard(curlExample, setCopiedCurl)}
              className="text-[10px] text-[var(--color-accent)] hover:underline cursor-pointer"
            >
              {copiedCurl ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <pre className="rounded-lg bg-[var(--color-code-bg)] p-3 text-xs text-[var(--color-code-text)] overflow-x-auto whitespace-pre-wrap" style={{ fontFamily: 'var(--font-mono)' }}>
            {curlExample}
          </pre>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <h4 className="text-xs font-semibold text-[var(--color-text-secondary)]">JavaScript Example</h4>
            <button
              onClick={() => copyToClipboard(jsExample, setCopiedJs)}
              className="text-[10px] text-[var(--color-accent)] hover:underline cursor-pointer"
            >
              {copiedJs ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <pre className="rounded-lg bg-[var(--color-code-bg)] p-3 text-xs text-[var(--color-code-text)] overflow-x-auto whitespace-pre-wrap" style={{ fontFamily: 'var(--font-mono)' }}>
            {jsExample}
          </pre>
        </div>

        <div>
          <h4 className="mb-1.5 text-xs font-semibold text-[var(--color-text-secondary)]">Response (200 OK)</h4>
          <pre className="rounded-lg bg-[var(--color-code-bg)] p-3 text-xs text-[var(--color-code-text)] overflow-x-auto" style={{ fontFamily: 'var(--font-mono)' }}>
{`{
  "ok": true,
  "batch": { ...appliedBatch },
  "diagnostics": {
    "violationsFixed": [],
    "fallbackUsed": false,
    "elementCount": number
  }
}`}
          </pre>
        </div>
      </div>
    </ScrollArea>
  );
}

/* ── Main Component ──────────────────────────────────────────────────────── */

interface PayloadPlaygroundProps {
  onInject: (batch: DrawBatch) => void;
  sessionId?: string;
}

export const PayloadPlayground = memo(function PayloadPlayground({
  onInject,
  sessionId,
}: PayloadPlaygroundProps) {
  const [activeTab, setActiveTab] = useState<'playground' | 'docs'>('playground');
  const [code, setCode] = useState(() =>
    JSON.stringify(PRESETS.circle.payload, null, 2),
  );
  const [validation, setValidation] = useState<{ valid: boolean; error?: string }>({ valid: true });
  const [scanning, setScanning] = useState(false);
  const [previewElements, setPreviewElements] = useState<DrawElement[]>(PRESETS.circle.payload.elements);
  const [copiedEndpoint, setCopiedEndpoint] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Validate JSON on change
  useEffect(() => {
    try {
      const parsed = JSON.parse(code);
      const result = DrawBatchSchema.safeParse(parsed);
      if (result.success) {
        setValidation({ valid: true });
        if (parsed.elements) {
          setPreviewElements(parsed.elements as DrawElement[]);
        }
      } else {
        const msg = result.error.issues
          .slice(0, 2)
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ');
        setValidation({ valid: false, error: msg });
      }
    } catch (e) {
      setValidation({ valid: false, error: e instanceof Error ? e.message : 'Invalid JSON' });
      setPreviewElements([]);
    }
  }, [code]);

  const handleInject = useCallback(() => {
    if (!validation.valid) return;
    try {
      const batch = JSON.parse(code) as DrawBatch;
      // Ensure unique batch_id
      batch.batch_id = `pg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      setScanning(true);
      setTimeout(() => {
        onInject(batch);
        setScanning(false);
      }, 1200);
    } catch { /* invalid JSON */ }
  }, [code, onInject, validation.valid]);

  const handlePresetClick = useCallback((key: string) => {
    const preset = PRESETS[key];
    if (!preset) return;
    const payload = { ...preset.payload, batch_id: `preset-${key}-${Date.now().toString(36)}` };
    setCode(JSON.stringify(payload, null, 2));
  }, []);

  const handleClear = useCallback(() => {
    setCode('{\n  \n}');
    setPreviewElements([]);
  }, []);

  const copyEndpoint = useCallback(async () => {
    try {
      await navigator.clipboard.writeText('POST /api/whiteboard/inject');
      setCopiedEndpoint(true);
      setTimeout(() => setCopiedEndpoint(false), 2000);
    } catch { /* clipboard not available */ }
  }, []);

  const handleDownloadPng = useCallback(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('.payload-preview-canvas canvas');
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = 'preview.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  }, []);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--color-surface)]">
      {/* Tab header */}
      <div className="flex items-center border-b border-[var(--color-border-subtle)] px-3">
        <button
          onClick={() => setActiveTab('playground')}
          className={`cursor-pointer border-b-2 px-3 py-2.5 text-xs font-semibold transition-colors ${
            activeTab === 'playground'
              ? 'border-[var(--color-accent)] text-[var(--color-text-primary)]'
              : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
          }`}
        >
          Playground
        </button>
        <button
          onClick={() => setActiveTab('docs')}
          className={`cursor-pointer border-b-2 px-3 py-2.5 text-xs font-semibold transition-colors ${
            activeTab === 'docs'
              ? 'border-[var(--color-accent)] text-[var(--color-text-primary)]'
              : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
          }`}
        >
          API Docs
        </button>
      </div>

      {activeTab === 'docs' ? (
        <ApiDocsTab />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Split pane: editor + preview */}
          <div className="flex min-h-0 flex-1">
            {/* JSON Editor (55%) */}
            <div className="flex w-[55%] flex-col border-r border-[var(--color-border-subtle)]">
              <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-3 py-1.5">
                <span className="text-[10px] font-medium text-[var(--color-text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
                  payload.json
                </span>
                {validation.valid ? (
                  <span className="text-[10px] text-[var(--color-mint)]">✓ Valid</span>
                ) : (
                  <span className="text-[10px] text-[var(--color-danger)]" title={validation.error}>
                    ✗ Invalid
                  </span>
                )}
              </div>
              <div className="relative min-h-0 flex-1">
                <div className="absolute inset-0 flex">
                  {/* Line numbers */}
                  <div
                    className="flex-shrink-0 select-none overflow-hidden border-r border-[var(--color-border-subtle)] bg-[var(--color-bg)] px-2 py-3 text-right text-[11px] leading-[1.5] text-[var(--color-text-muted)]"
                    style={{ fontFamily: 'var(--font-mono)', minWidth: '2.5rem' }}
                    aria-hidden="true"
                  >
                    {code.split('\n').map((_, i) => (
                      <div key={i}>{i + 1}</div>
                    ))}
                  </div>
                  {/* Textarea + syntax overlay */}
                  <div className="relative min-w-0 flex-1">
                    <pre
                      className="pointer-events-none absolute inset-0 overflow-auto whitespace-pre-wrap break-words p-3 text-[12px] leading-[1.5] text-transparent"
                      style={{ fontFamily: 'var(--font-mono)' }}
                      aria-hidden="true"
                      dangerouslySetInnerHTML={{ __html: highlightJson(code) }}
                    />
                    <textarea
                      ref={textareaRef}
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      spellCheck={false}
                      className="absolute inset-0 resize-none bg-transparent p-3 text-[12px] leading-[1.5] text-[var(--color-code-text)] caret-[var(--color-accent)] outline-none"
                      style={{ fontFamily: 'var(--font-mono)', color: 'transparent', caretColor: 'var(--color-accent)' }}
                    />
                  </div>
                </div>
              </div>
              {!validation.valid && validation.error && (
                <div className="border-t border-[var(--color-danger)]/30 bg-[rgba(255,79,79,0.06)] px-3 py-1.5 text-[10px] text-[var(--color-danger)]">
                  {validation.error}
                </div>
              )}
            </div>

            {/* Mini Canvas Preview (45%) */}
            <div className="payload-preview-canvas flex w-[45%] flex-col">
              <div className="border-b border-[var(--color-border-subtle)] px-3 py-1.5">
                <span className="text-[10px] font-medium text-[var(--color-text-muted)]">Live Preview</span>
              </div>
              <div className="flex flex-1 items-center justify-center p-3">
                <div className="h-[240px] w-[300px]">
                  <MiniPreview elements={previewElements} scanning={scanning} />
                </div>
              </div>
            </div>
          </div>

          {/* Preset buttons */}
          <div className="flex items-center gap-2 border-t border-[var(--color-border-subtle)] px-3 py-2">
            <span className="text-[10px] text-[var(--color-text-muted)]">Presets:</span>
            {Object.entries(PRESETS).map(([key, preset]) => (
              <button
                key={key}
                onClick={() => handlePresetClick(key)}
                className="cursor-pointer rounded-md bg-[var(--color-surface-raised)] px-2 py-1 text-[10px] font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-high)] hover:text-[var(--color-text-primary)]"
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 border-t border-[var(--color-border-subtle)] px-3 py-2">
            <Button
              variant="primary"
              size="sm"
              onClick={handleInject}
              disabled={!validation.valid || scanning}
              loading={scanning}
            >
              {scanning ? 'Compiling...' : 'Inject to Canvas'}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleDownloadPng}>
              Download PNG
            </Button>
            <Button variant="ghost" size="sm" onClick={handleClear}>
              Clear
            </Button>
          </div>

          {/* API info strip */}
          <div className="flex items-center justify-between border-t border-[var(--color-border-subtle)] bg-[var(--color-bg)] px-3 py-1.5">
            <code className="text-[10px] text-[var(--color-text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
              POST /api/whiteboard/inject
            </code>
            <button
              onClick={copyEndpoint}
              className="cursor-pointer text-[10px] text-[var(--color-accent)] hover:underline"
            >
              {copiedEndpoint ? '✓ Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
});
