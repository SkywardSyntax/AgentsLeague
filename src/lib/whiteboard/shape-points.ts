import type { DrawElement, Point, StylePreset } from '@/types/agent';

export function strokeWidthForPreset(preset: StylePreset | undefined, base: number): number {
  switch (preset) {
    case 'rough_sketch':
      return base * 1.15;
    case 'blueprint_neat':
      return base * 0.88;
    default:
      return base;
  }
}

export function rectPoints(el: Extract<DrawElement, { type: 'rect' }>): Point[] {
  return [
    { x: el.x, y: el.y },
    { x: el.x + el.w, y: el.y },
    { x: el.x + el.w, y: el.y + el.h },
    { x: el.x, y: el.y + el.h },
    { x: el.x, y: el.y },
  ];
}

export function ellipsePoints(el: Extract<DrawElement, { type: 'ellipse' }>): Point[] {
  const circumference = Math.PI * (3 * (el.rx + el.ry) - Math.sqrt((3 * el.rx + el.ry) * (el.rx + 3 * el.ry)));
  const steps = Math.max(36, Math.ceil(circumference / 5));
  const pts: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (Math.PI * 2 * i) / steps;
    pts.push({
      x: el.cx + Math.cos(t) * el.rx,
      y: el.cy + Math.sin(t) * el.ry,
    });
  }
  return pts;
}

export function linePoints(el: Extract<DrawElement, { type: 'line' } | { type: 'arrow' }>): Point[] {
  return [el.from, el.to];
}

export function arrowHeadPoints(el: Extract<DrawElement, { type: 'arrow' }>): Point[][] {
  const dx = el.to.x - el.from.x;
  const dy = el.to.y - el.from.y;
  const angle = Math.atan2(dy, dx);
  const headLen = 14;
  const wing = Math.PI / 7;

  const left: Point = {
    x: el.to.x - Math.cos(angle - wing) * headLen,
    y: el.to.y - Math.sin(angle - wing) * headLen,
  };
  const right: Point = {
    x: el.to.x - Math.cos(angle + wing) * headLen,
    y: el.to.y - Math.sin(angle + wing) * headLen,
  };

  return [
    [left, el.to],
    [right, el.to],
  ];
}
