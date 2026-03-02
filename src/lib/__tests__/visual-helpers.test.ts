import { describe, it, expect } from 'vitest';
import {
  captureLayout,
  diffLayouts,
  expectDimensions,
  expectVisible,
  expectHidden,
  type LayoutSnapshot,
} from '@/test/visual-helpers';

function makeSnapshot(overrides?: Partial<LayoutSnapshot>): LayoutSnapshot {
  return {
    tag: 'DIV',
    visible: true,
    bounds: { width: 100, height: 50, x: 0, y: 0 },
    styles: {},
    children: [],
    ...overrides,
  };
}

describe('Visual Regression Helpers', () => {
  describe('captureLayout', () => {
    it('captures tag name and test-id from a simple div', () => {
      const div = document.createElement('div');
      div.setAttribute('data-testid', 'my-widget');
      document.body.appendChild(div);

      const snapshot = captureLayout(div);
      expect(snapshot.tag).toBe('DIV');
      expect(snapshot.testId).toBe('my-widget');

      document.body.removeChild(div);
    });

    it('captures nested children up to maxDepth', () => {
      const root = document.createElement('div');
      const child = document.createElement('span');
      const grandchild = document.createElement('a');
      const greatGrandchild = document.createElement('b');
      grandchild.appendChild(greatGrandchild);
      child.appendChild(grandchild);
      root.appendChild(child);
      document.body.appendChild(root);

      const snapshot = captureLayout(root, { maxDepth: 2 });
      expect(snapshot.children).toHaveLength(1);
      expect(snapshot.children[0].children).toHaveLength(1);
      // grandchild's children should be empty because maxDepth=2
      expect(snapshot.children[0].children[0].children).toHaveLength(0);

      document.body.removeChild(root);
    });

    it('marks visible: false for display: none elements', () => {
      const div = document.createElement('div');
      div.style.display = 'none';
      document.body.appendChild(div);

      const snapshot = captureLayout(div);
      expect(snapshot.visible).toBe(false);

      document.body.removeChild(div);
    });
  });

  describe('diffLayouts', () => {
    it('returns empty array for identical snapshots', () => {
      const a = makeSnapshot();
      const b = makeSnapshot();
      expect(diffLayouts(a, b)).toEqual([]);
    });

    it('detects dimension changes beyond tolerance', () => {
      const before = makeSnapshot({ bounds: { width: 100, height: 50, x: 0, y: 0 } });
      const after = makeSnapshot({ bounds: { width: 120, height: 50, x: 0, y: 0 } });
      const diffs = diffLayouts(before, after, { size: 5 });
      expect(diffs.length).toBeGreaterThan(0);
      expect(diffs.some((d) => d.field === 'bounds.width')).toBe(true);
    });

    it('ignores dimension changes within tolerance', () => {
      const before = makeSnapshot({ bounds: { width: 100, height: 50, x: 0, y: 0 } });
      const after = makeSnapshot({ bounds: { width: 103, height: 50, x: 0, y: 0 } });
      const diffs = diffLayouts(before, after, { size: 5 });
      expect(diffs).toEqual([]);
    });

    it('detects structural changes (added/removed children)', () => {
      const before = makeSnapshot({ children: [makeSnapshot({ tag: 'SPAN' })] });
      const after = makeSnapshot({ children: [] });
      const diffs = diffLayouts(before, after);
      expect(diffs.some((d) => d.field === 'children.length')).toBe(true);
    });
  });

  describe('expectDimensions', () => {
    it('passes for element within range', () => {
      // jsdom returns 0 for getBoundingClientRect, so we check 0 is within range
      const div = document.createElement('div');
      document.body.appendChild(div);

      expect(() =>
        expectDimensions(div, { minWidth: 0, maxWidth: 500, minHeight: 0, maxHeight: 500 }),
      ).not.toThrow();

      document.body.removeChild(div);
    });
  });

  describe('expectVisible / expectHidden', () => {
    it('expectVisible throws for a hidden element', () => {
      const container = document.createElement('div');
      const child = document.createElement('span');
      child.setAttribute('data-testid', 'target');
      child.style.display = 'none';
      container.appendChild(child);
      document.body.appendChild(container);

      expect(() => expectVisible(container, 'target')).toThrow();

      document.body.removeChild(container);
    });

    it('expectHidden throws for a visible element', () => {
      const container = document.createElement('div');
      const child = document.createElement('span');
      child.setAttribute('data-testid', 'target');
      container.appendChild(child);
      document.body.appendChild(container);

      expect(() => expectHidden(container, 'target')).toThrow();

      document.body.removeChild(container);
    });
  });
});
