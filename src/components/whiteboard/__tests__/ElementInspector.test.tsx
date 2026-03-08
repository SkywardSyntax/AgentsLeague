import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ElementInspector, type ElementInspectorProps } from '../ElementInspector';
import type { DrawBatch, DrawElement } from '@/types/agent';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeElement(type: string, id: string, extra: Record<string, unknown> = {}): DrawElement {
  return { type, id, ...extra } as unknown as DrawElement;
}

function makeBatch(
  elements: DrawElement[],
  overrides: Partial<DrawBatch> = {},
): DrawBatch {
  return {
    batch_id: `batch-${Math.random().toString(36).slice(2)}`,
    elements,
    ...overrides,
  };
}

function renderInspector(overrides: Partial<ElementInspectorProps> = {}) {
  const props: ElementInspectorProps = {
    scene: [],
    batches: [],
    open: true,
    onClose: () => {},
    ...overrides,
  };
  return render(<ElementInspector {...props} />);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ElementInspector', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders empty state correctly', () => {
    renderInspector({ scene: [], batches: [] });

    expect(screen.getByTestId('element-inspector')).toBeTruthy();
    expect(screen.getByTestId('inspector-empty')).toBeTruthy();
    expect(screen.getByTestId('inspector-total-count').textContent).toBe('0');
  });

  it('shows element count after providing mock elements', () => {
    const scene: DrawElement[] = [
      makeElement('function_curve', 'fc1', { expression: 'sin(x)' }),
      makeElement('function_curve', 'fc2', { expression: 'cos(x)' }),
      makeElement('function_curve', 'fc3', { expression: 'tan(x)' }),
      makeElement('cartesian_axes', 'ca1', { xLabel: 'x' }),
      makeElement('cartesian_axes', 'ca2', { xLabel: 'y' }),
      makeElement('text', 't1', { text: 'Hello' }),
    ];

    renderInspector({ scene, batches: [makeBatch(scene)] });

    expect(screen.getByTestId('inspector-total-count').textContent).toBe('6');

    const panel = screen.getByTestId('element-inspector');
    expect(panel.textContent).toContain('3× function_curve');
    expect(panel.textContent).toContain('2× cartesian_axes');
    expect(panel.textContent).toContain('1× text');
  });

  it('clicking an element shows its JSON', () => {
    const scene: DrawElement[] = [
      makeElement('rect', 'r1', { x: 10, y: 20, w: 100, h: 50 }),
    ];

    renderInspector({ scene, batches: [makeBatch(scene)] });

    expect(screen.queryByTestId('inspector-json')).toBeNull();

    fireEvent.click(screen.getByTestId('inspector-element-0'));

    const json = screen.getByTestId('inspector-json');
    expect(json).toBeTruthy();
    expect(json.textContent).toContain('"type": "rect"');
    expect(json.textContent).toContain('"id": "r1"');
    expect(json.textContent).toContain('"x": 10');
  });

  it('shows last batch info', () => {
    const batch = makeBatch(
      [makeElement('line', 'l1')],
      { batch_id: 'test-batch-123', sequenceNumber: 5, colorTheme: 'dark' as DrawBatch['colorTheme'] },
    );

    renderInspector({ scene: [makeElement('line', 'l1')], batches: [batch] });

    const panel = screen.getByTestId('element-inspector');
    expect(panel.textContent).toContain('test-batch-1');
    expect(panel.textContent).toContain('5');
  });

  it('toggles element JSON off when clicking the same element again', () => {
    const scene: DrawElement[] = [makeElement('text', 't1', { text: 'Hi' })];
    renderInspector({ scene, batches: [makeBatch(scene)] });

    fireEvent.click(screen.getByTestId('inspector-element-0'));
    expect(screen.getByTestId('inspector-json')).toBeTruthy();

    fireEvent.click(screen.getByTestId('inspector-element-0'));
    expect(screen.queryByTestId('inspector-json')).toBeNull();
  });
});
