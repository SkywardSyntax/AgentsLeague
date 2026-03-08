'use client';

import { memo, useState, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Collapsible section helper
// ---------------------------------------------------------------------------

let sectionCounter = 0;

function Section({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [sectionId] = useState(() => `docs-section-${++sectionCounter}`);
  return (
    <div className="border-b border-[var(--color-border)] last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={sectionId}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-[11px] font-semibold text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-surface-soft)]"
      >
        {title}
        <span
          className="text-[var(--color-text-muted)] transition-transform duration-200"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
          aria-hidden="true"
        >
          ▾
        </span>
      </button>
      {open && <div id={sectionId} className="px-3 pb-3">{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Code block helper
// ---------------------------------------------------------------------------

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-md border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-2 font-mono text-[10px] leading-relaxed text-[var(--color-text-primary)]">
      {children}
    </pre>
  );
}

// ---------------------------------------------------------------------------
// DrawingPayloadDocs
// ---------------------------------------------------------------------------

interface DrawingPayloadDocsProps {
  onClose: () => void;
}

export const DrawingPayloadDocs = memo(function DrawingPayloadDocs({
  onClose,
}: DrawingPayloadDocsProps) {
  return (
    <div className="flex max-h-[60vh] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-panel)] shadow-[var(--shadow-soft)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm">📖</span>
          <span className="text-xs font-semibold text-[var(--color-text-primary)]">
            DrawBatch Documentation
          </span>
          <span className="rounded-full bg-[var(--color-accent-faint)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--color-accent)]">
            v1
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close documentation"
          className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-text-secondary)]"
        >
          ✕
        </button>
      </div>

      {/* Scrollable content */}
      <div className="overflow-y-auto">
        {/* Quick Start */}
        <Section title="⚡ Quick Start" defaultOpen>
          <div className="flex flex-col gap-2">
            <p className="text-[11px] leading-relaxed text-[var(--color-text-secondary)]">
              Paste any <strong>DrawBatch</strong> JSON to instantly draw on the
              whiteboard. Use the template gallery for quick starts, or write
              custom payloads for precise control.
            </p>
            <ol className="flex flex-col gap-1 pl-3 text-[10px] text-[var(--color-text-secondary)]">
              <li>1. Pick a template or write JSON in the editor</li>
              <li>2. The validator checks your payload in real time</li>
              <li>3. Click <strong>Inject</strong> to draw on the canvas</li>
            </ol>
          </div>
        </Section>

        {/* DrawBatch Structure */}
        <Section title="📦 DrawBatch Structure">
          <div className="flex flex-col gap-2">
            <p className="text-[10px] text-[var(--color-text-muted)]">
              Every payload is a DrawBatch object with these fields:
            </p>
            <Code>{`{
  "batch_id": "my-batch-001",    // Unique ID (required)
  "style_preset": "blueprint_neat", // Rendering style (optional)
  "elements": [                  // Array of draw elements
    { "id": "e1", "type": "rect", ... }
  ],
  "source": "injection",         // Origin tag (optional)
  "schemaVersion": 1             // Schema version (default: 1)
}`}</Code>
            <div className="flex flex-col gap-1">
              <p className="text-[10px] font-medium text-[var(--color-text-primary)]">
                Fields:
              </p>
              <table className="w-full text-[10px]">
                <tbody>
                  <tr className="border-b border-[var(--color-border)]">
                    <td className="py-1 pr-2 font-mono font-medium text-[var(--color-accent)]">batch_id</td>
                    <td className="py-1 text-[var(--color-text-secondary)]">Unique string, 1–64 chars</td>
                  </tr>
                  <tr className="border-b border-[var(--color-border)]">
                    <td className="py-1 pr-2 font-mono font-medium text-[var(--color-accent)]">style_preset</td>
                    <td className="py-1 text-[var(--color-text-secondary)]">
                      <code className="text-[9px]">clean_pen_sketch</code> | <code className="text-[9px]">rough_sketch</code> | <code className="text-[9px]">blueprint_neat</code> | <code className="text-[9px]">mathematical</code>
                    </td>
                  </tr>
                  <tr className="border-b border-[var(--color-border)]">
                    <td className="py-1 pr-2 font-mono font-medium text-[var(--color-accent)]">elements</td>
                    <td className="py-1 text-[var(--color-text-secondary)]">Array of DrawElements (max 200)</td>
                  </tr>
                  <tr>
                    <td className="py-1 pr-2 font-mono font-medium text-[var(--color-accent)]">source</td>
                    <td className="py-1 text-[var(--color-text-secondary)]">
                      <code className="text-[9px]">ai-stream</code> | <code className="text-[9px]">injection</code> | <code className="text-[9px]">template</code>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </Section>

        {/* Element Types */}
        <Section title="🧩 Element Types (13)">
          <div className="flex flex-col gap-2">
            <p className="text-[10px] text-[var(--color-text-muted)]">
              All elements share <code className="text-[9px]">id</code>, <code className="text-[9px]">color?</code>, <code className="text-[9px]">stroke_width?</code>, <code className="text-[9px]">lineStyle?</code> from BaseDrawElement.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="border-b border-[var(--color-border)] text-left">
                    <th className="py-1 pr-2 font-semibold text-[var(--color-text-primary)]">Type</th>
                    <th className="py-1 pr-2 font-semibold text-[var(--color-text-primary)]">Key Fields</th>
                    <th className="py-1 font-semibold text-[var(--color-text-primary)]">Use</th>
                  </tr>
                </thead>
                <tbody className="text-[var(--color-text-secondary)]">
                  <tr className="border-b border-[var(--color-border)]">
                    <td className="py-1 pr-2 font-mono text-[var(--color-accent)]">rect</td>
                    <td className="py-1 pr-2">x, y, w, h</td>
                    <td className="py-1">Rectangles, boxes</td>
                  </tr>
                  <tr className="border-b border-[var(--color-border)]">
                    <td className="py-1 pr-2 font-mono text-[var(--color-accent)]">ellipse</td>
                    <td className="py-1 pr-2">cx, cy, rx, ry</td>
                    <td className="py-1">Circles, ovals</td>
                  </tr>
                  <tr className="border-b border-[var(--color-border)]">
                    <td className="py-1 pr-2 font-mono text-[var(--color-accent)]">line</td>
                    <td className="py-1 pr-2">from, to (Point)</td>
                    <td className="py-1">Line segments</td>
                  </tr>
                  <tr className="border-b border-[var(--color-border)]">
                    <td className="py-1 pr-2 font-mono text-[var(--color-accent)]">arrow</td>
                    <td className="py-1 pr-2">from, to (Point)</td>
                    <td className="py-1">Arrows with heads</td>
                  </tr>
                  <tr className="border-b border-[var(--color-border)]">
                    <td className="py-1 pr-2 font-mono text-[var(--color-accent)]">text</td>
                    <td className="py-1 pr-2">x, y, text, size?</td>
                    <td className="py-1">Plain text labels</td>
                  </tr>
                  <tr className="border-b border-[var(--color-border)]">
                    <td className="py-1 pr-2 font-mono text-[var(--color-accent)]">latex</td>
                    <td className="py-1 pr-2">x, y, tex, fontSize?</td>
                    <td className="py-1">LaTeX math formulas</td>
                  </tr>
                  <tr className="border-b border-[var(--color-border)]">
                    <td className="py-1 pr-2 font-mono text-[var(--color-accent)]">clear</td>
                    <td className="py-1 pr-2">(none)</td>
                    <td className="py-1">Clears the canvas</td>
                  </tr>
                  <tr className="border-b border-[var(--color-border)]">
                    <td className="py-1 pr-2 font-mono text-[var(--color-accent)]">cartesian_axes</td>
                    <td className="py-1 pr-2">x, y, width, height, xRange, yRange</td>
                    <td className="py-1">Coordinate system</td>
                  </tr>
                  <tr className="border-b border-[var(--color-border)]">
                    <td className="py-1 pr-2 font-mono text-[var(--color-accent)]">number_line</td>
                    <td className="py-1 pr-2">x, y, length, min, max</td>
                    <td className="py-1">1D number line</td>
                  </tr>
                  <tr className="border-b border-[var(--color-border)]">
                    <td className="py-1 pr-2 font-mono text-[var(--color-accent)]">function_curve</td>
                    <td className="py-1 pr-2">x, y, width, height, xRange, yRange, points?</td>
                    <td className="py-1">Plot a math function</td>
                  </tr>
                  <tr className="border-b border-[var(--color-border)]">
                    <td className="py-1 pr-2 font-mono text-[var(--color-accent)]">vector_arrow</td>
                    <td className="py-1 pr-2">x, y, dx, dy, label?</td>
                    <td className="py-1">Physics/math vectors</td>
                  </tr>
                  <tr className="border-b border-[var(--color-border)]">
                    <td className="py-1 pr-2 font-mono text-[var(--color-accent)]">matrix_bracket</td>
                    <td className="py-1 pr-2">x, y, rows[][], bracketStyle</td>
                    <td className="py-1">Matrix notation</td>
                  </tr>
                  <tr className="border-b border-[var(--color-border)]">
                    <td className="py-1 pr-2 font-mono text-[var(--color-accent)]">angle_arc</td>
                    <td className="py-1 pr-2">x, y, radius, startAngle, endAngle</td>
                    <td className="py-1">Angle indicators</td>
                  </tr>
                  <tr>
                    <td className="py-1 pr-2 font-mono text-[var(--color-accent)]">integral_region</td>
                    <td className="py-1 pr-2">x, y, width, height, xRange, yRange, topPoints</td>
                    <td className="py-1">Shaded area under curve</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </Section>

        {/* Math Primitives */}
        <Section title="📐 Math Primitives">
          <div className="flex flex-col gap-3">
            <div>
              <p className="mb-1 text-[10px] font-semibold text-[var(--color-text-primary)]">
                cartesian_axes
              </p>
              <Code>{`{
  "id": "axes1", "type": "cartesian_axes",
  "x": 100, "y": 60,
  "width": 800, "height": 600,
  "xRange": [-5, 5], "yRange": [-5, 5],
  "xLabel": "x", "yLabel": "y",
  "gridlines": true
}`}</Code>
            </div>

            <div>
              <p className="mb-1 text-[10px] font-semibold text-[var(--color-text-primary)]">
                number_line
              </p>
              <Code>{`{
  "id": "nl1", "type": "number_line",
  "x": 100, "y": 350, "length": 800,
  "min": -5, "max": 5, "label": "ℝ",
  "highlights": [{ "value": 2, "label": "a" }],
  "intervals": [{ "from": -1, "to": 3, "color": "#2563eb" }]
}`}</Code>
            </div>

            <div>
              <p className="mb-1 text-[10px] font-semibold text-[var(--color-text-primary)]">
                function_curve
              </p>
              <Code>{`{
  "id": "fc1", "type": "function_curve",
  "x": 100, "y": 60,
  "width": 800, "height": 500,
  "xRange": [-3, 3], "yRange": [-1, 9],
  "expression": "x*x",
  "label": "f(x) = x²"
}`}</Code>
              <p className="mt-1 text-[9px] text-[var(--color-text-muted)]">
                Tip: Use <code>points</code> array for pre-sampled data instead of <code>expression</code>.
              </p>
            </div>
          </div>
        </Section>

        {/* Color Reference */}
        <Section title="🎨 Color Reference">
          <div className="flex flex-col gap-2">
            <p className="text-[10px] text-[var(--color-text-muted)]">
              Suggested colors for consistent styling:
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { label: 'Axis / grid', color: '#666666' },
                { label: 'Curve / primary', color: '#2563eb' },
                { label: 'Annotation', color: '#1e40af' },
                { label: 'Fill (translucent)', color: '#3b82f620' },
                { label: 'Accent red', color: '#c61f1f' },
                { label: 'Success green', color: '#22c55e' },
                { label: 'Text dark', color: '#111827' },
                { label: 'Text muted', color: '#64748b' },
              ].map(({ label, color }) => (
                <div key={label} className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-3 w-3 shrink-0 rounded-sm border border-[var(--color-border)]"
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-[10px] text-[var(--color-text-secondary)]">{label}</span>
                  <code className="ml-auto text-[9px] text-[var(--color-text-muted)]">{color}</code>
                </div>
              ))}
            </div>
          </div>
        </Section>

        {/* Coordinate System */}
        <Section title="📏 Coordinate System">
          <div className="flex flex-col gap-2">
            <div className="overflow-x-auto">
              <table className="w-full text-[10px]">
                <tbody>
                  <tr className="border-b border-[var(--color-border)]">
                    <td className="py-1 pr-2 font-medium text-[var(--color-text-primary)]">Canvas size</td>
                    <td className="py-1 text-[var(--color-text-secondary)]">1400 × 700 px</td>
                  </tr>
                  <tr className="border-b border-[var(--color-border)]">
                    <td className="py-1 pr-2 font-medium text-[var(--color-text-primary)]">Origin</td>
                    <td className="py-1 text-[var(--color-text-secondary)]">Top-left corner (0, 0)</td>
                  </tr>
                  <tr className="border-b border-[var(--color-border)]">
                    <td className="py-1 pr-2 font-medium text-[var(--color-text-primary)]">X axis</td>
                    <td className="py-1 text-[var(--color-text-secondary)]">→ increases right (0 – 1400)</td>
                  </tr>
                  <tr className="border-b border-[var(--color-border)]">
                    <td className="py-1 pr-2 font-medium text-[var(--color-text-primary)]">Y axis</td>
                    <td className="py-1 text-[var(--color-text-secondary)]">↓ increases down (0 – 700)</td>
                  </tr>
                  <tr>
                    <td className="py-1 pr-2 font-medium text-[var(--color-text-primary)]">Safe area</td>
                    <td className="py-1 text-[var(--color-text-secondary)]">
                      x: [50 – 1350], y: [50 – 650]
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-[9px] text-[var(--color-text-muted)]">
              Keep elements inside the safe area to avoid clipping at edges.
              Cartesian axes elements handle their own internal coordinate mapping.
            </p>
          </div>
        </Section>

        {/* Style Presets */}
        <Section title="🖌️ Style Presets">
          <div className="flex flex-col gap-2">
            <div className="grid gap-1.5">
              {[
                {
                  name: 'blueprint_neat',
                  desc: 'Precise math diagrams — clean lines, no wobble. Best for formal geometry and algebraic layouts.',
                },
                {
                  name: 'clean_pen_sketch',
                  desc: 'Casual hand-drawn feel — slight randomness in lines. Good for quick illustrations and teaching.',
                },
                {
                  name: 'rough_sketch',
                  desc: 'Rougher sketch style — more hand-drawn wobble. Good for brainstorming and drafts.',
                },
                {
                  name: 'mathematical',
                  desc: 'Optimized for math notation — balanced between precision and readability.',
                },
              ].map(({ name, desc }) => (
                <div
                  key={name}
                  className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2 py-1.5"
                >
                  <code className="text-[10px] font-semibold text-[var(--color-accent)]">
                    {name}
                  </code>
                  <p className="mt-0.5 text-[9px] leading-snug text-[var(--color-text-muted)]">
                    {desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
});
