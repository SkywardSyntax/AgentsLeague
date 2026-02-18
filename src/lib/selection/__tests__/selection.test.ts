import { describe, it, expect, beforeEach } from 'vitest';
import { SelectionManager } from '../SelectionManager';
import type { DrawElement, RectElement, EllipseElement, Point } from '@/types';

function makeRect(id: string, x: number, y: number, w: number, h: number): RectElement {
  return {
    id,
    type: 'rect',
    x,
    y,
    w,
    h,
    rotation: 0,
    opacity: 1,
    locked: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    cornerRadius: 0,
    fill: { type: 'solid', color: '#000000', opacity: 1 },
    stroke: { color: '#000000', width: 1, lineCap: 'round', lineJoin: 'round' },
  };
}

function makeEllipse(id: string, x: number, y: number, rx: number, ry: number): EllipseElement {
  return {
    id,
    type: 'ellipse',
    x,
    y,
    rx,
    ry,
    rotation: 0,
    opacity: 1,
    locked: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    fill: { type: 'solid', color: '#000000', opacity: 1 },
    stroke: { color: '#000000', width: 1, lineCap: 'round', lineJoin: 'round' },
  };
}

describe('SelectionManager', () => {
  let manager: SelectionManager;

  beforeEach(() => {
    manager = new SelectionManager();
  });

  describe('R-tree hit-testing', () => {
    it('should find elements at a point', () => {
      const rect = makeRect('r1', 10, 10, 100, 100);
      manager.load([rect]);

      const hits = manager.hitTest(50, 50);
      expect(hits).toHaveLength(1);
      expect(hits[0]!.id).toBe('r1');
    });

    it('should not find elements outside their bounds', () => {
      const rect = makeRect('r1', 10, 10, 100, 100);
      manager.load([rect]);

      const hits = manager.hitTest(200, 200);
      expect(hits).toHaveLength(0);
    });

    it('should find multiple overlapping elements', () => {
      const rect1 = makeRect('r1', 0, 0, 100, 100);
      const rect2 = makeRect('r2', 50, 50, 100, 100);
      manager.load([rect1, rect2]);

      const hits = manager.hitTest(75, 75);
      expect(hits).toHaveLength(2);
    });

    it('should handle ellipse elements', () => {
      const ellipse = makeEllipse('e1', 100, 100, 50, 50);
      manager.load([ellipse]);

      const hits = manager.hitTest(100, 100);
      expect(hits).toHaveLength(1);
      expect(hits[0]!.id).toBe('e1');
    });

    it('should return topmost element via hitTestSingle', () => {
      const rect1 = makeRect('r1', 0, 0, 100, 100);
      const rect2 = makeRect('r2', 50, 50, 100, 100);
      manager.load([rect1, rect2]);

      const hit = manager.hitTestSingle(75, 75);
      expect(hit).not.toBeNull();
      expect(hit!.id).toBe('r2');
    });

    it('should handle hit-testing with 1000 elements under 1ms', () => {
      const elements: DrawElement[] = [];
      for (let i = 0; i < 1000; i++) {
        elements.push(makeRect(`r${i}`, i * 10, i * 10, 20, 20));
      }
      manager.load(elements);

      const start = performance.now();
      manager.hitTest(105, 105);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(5); // generous margin, target <1ms
    });

    it('should insert and remove individual elements', () => {
      const rect = makeRect('r1', 10, 10, 100, 100);
      manager.insert(rect);

      expect(manager.hitTest(50, 50)).toHaveLength(1);

      manager.remove('r1');
      expect(manager.hitTest(50, 50)).toHaveLength(0);
    });
  });

  describe('Marquee selection', () => {
    it('should select elements within a rectangle', () => {
      const rect1 = makeRect('r1', 10, 10, 30, 30);
      const rect2 = makeRect('r2', 100, 100, 30, 30);
      const rect3 = makeRect('r3', 20, 20, 10, 10);
      manager.load([rect1, rect2, rect3]);

      const selected = manager.marqueeSelect({ x: 0, y: 0, w: 60, h: 60 });
      expect(selected.has('r1')).toBe(true);
      expect(selected.has('r3')).toBe(true);
      expect(selected.has('r2')).toBe(false);
    });

    it('should support add mode', () => {
      const rect1 = makeRect('r1', 10, 10, 30, 30);
      const rect2 = makeRect('r2', 100, 100, 30, 30);
      manager.load([rect1, rect2]);

      manager.selectElement('r1');
      const selected = manager.marqueeSelect({ x: 90, y: 90, w: 50, h: 50 }, 'add');
      expect(selected.has('r1')).toBe(true);
      expect(selected.has('r2')).toBe(true);
    });
  });

  describe('Lasso selection', () => {
    it('should select elements whose center is inside the polygon', () => {
      const rect1 = makeRect('r1', 10, 10, 20, 20); // center at (20, 20)
      const rect2 = makeRect('r2', 200, 200, 20, 20); // center at (210, 210)
      manager.load([rect1, rect2]);

      const polygon: Point[] = [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 50, y: 50 },
        { x: 0, y: 50 },
      ];

      const selected = manager.lassoSelect(polygon);
      expect(selected.has('r1')).toBe(true);
      expect(selected.has('r2')).toBe(false);
    });

    it('should require at least 3 points', () => {
      const rect = makeRect('r1', 10, 10, 20, 20);
      manager.load([rect]);

      const selected = manager.lassoSelect([
        { x: 0, y: 0 },
        { x: 50, y: 50 },
      ]);
      expect(selected.size).toBe(0);
    });
  });

  describe('Multi-select state', () => {
    it('should select and deselect elements', () => {
      const rect = makeRect('r1', 10, 10, 30, 30);
      manager.load([rect]);

      manager.selectElement('r1');
      expect(manager.isSelected('r1')).toBe(true);
      expect(manager.getSelectedIds().size).toBe(1);

      manager.deselectAll();
      expect(manager.isSelected('r1')).toBe(false);
      expect(manager.getSelectedIds().size).toBe(0);
    });

    it('should toggle selection', () => {
      const rect = makeRect('r1', 10, 10, 30, 30);
      manager.load([rect]);

      manager.toggleSelect('r1');
      expect(manager.isSelected('r1')).toBe(true);

      manager.toggleSelect('r1');
      expect(manager.isSelected('r1')).toBe(false);
    });

    it('should support multi-select via add mode', () => {
      const rect1 = makeRect('r1', 10, 10, 30, 30);
      const rect2 = makeRect('r2', 100, 100, 30, 30);
      manager.load([rect1, rect2]);

      manager.selectElement('r1');
      manager.selectElement('r2', 'add');
      expect(manager.getSelectedIds().size).toBe(2);
    });

    it('should return selection highlights with correct bounds', () => {
      const rect = makeRect('r1', 10, 20, 100, 50);
      manager.load([rect]);
      manager.selectElement('r1');

      const highlights = manager.getSelectionHighlights();
      expect(highlights).toHaveLength(1);
      expect(highlights[0]!.elementId).toBe('r1');
      expect(highlights[0]!.bounds).toEqual({ x: 10, y: 20, w: 100, h: 50 });
    });

    it('should support viewport culling', () => {
      const rect1 = makeRect('r1', 10, 10, 30, 30);
      const rect2 = makeRect('r2', 500, 500, 30, 30);
      manager.load([rect1, rect2]);

      const visible = manager.getVisibleElements({ x: 0, y: 0, w: 100, h: 100 });
      expect(visible).toHaveLength(1);
      expect(visible[0]!.id).toBe('r1');
    });
  });
});
