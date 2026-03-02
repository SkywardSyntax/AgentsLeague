import type { Point } from '@/types/agent';

export interface StrokeBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface BezierSegment {
  start: Point;
  cp1: Point;
  cp2: Point;
  end: Point;
}

export function svgBounds(
  bounds: StrokeBounds,
  opts?: { stroke?: string; fill?: string; label?: string },
): string {
  const x = bounds.minX;
  const y = bounds.minY;
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const stroke = opts?.stroke ?? 'red';
  const fill = opts?.fill ?? 'none';
  let svg = `<rect x="${x}" y="${y}" width="${width}" height="${height}" stroke="${stroke}" fill="${fill}" />`;
  if (opts?.label) {
    svg += `<text x="${x}" y="${y - 4}" font-size="12" fill="${stroke}">${opts.label}</text>`;
  }
  return svg;
}

export function svgControlPoints(
  points: Point[],
  opts?: { radius?: number; fill?: string },
): string {
  const r = opts?.radius ?? 3;
  const fill = opts?.fill ?? 'blue';
  return points
    .map((p) => `<circle cx="${p.x}" cy="${p.y}" r="${r}" fill="${fill}" />`)
    .join('');
}

export function svgBezierChain(
  segments: BezierSegment[],
  opts?: { stroke?: string; showControlPoints?: boolean },
): string {
  if (segments.length === 0) return '';
  const stroke = opts?.stroke ?? 'green';
  const first = segments[0]!;
  let d = `M ${first.start.x} ${first.start.y}`;
  for (const seg of segments) {
    d += ` C ${seg.cp1.x} ${seg.cp1.y}, ${seg.cp2.x} ${seg.cp2.y}, ${seg.end.x} ${seg.end.y}`;
  }
  let svg = `<path d="${d}" stroke="${stroke}" fill="none" />`;
  if (opts?.showControlPoints) {
    const cpPoints = segments.flatMap((s) => [s.cp1, s.cp2]);
    svg += svgControlPoints(cpPoints, { radius: 2, fill: 'orange' });
  }
  return svg;
}

export function svgIntersection(
  a: StrokeBounds,
  b: StrokeBounds,
  opts?: { fill?: string },
): string | null {
  const minX = Math.max(a.minX, b.minX);
  const minY = Math.max(a.minY, b.minY);
  const maxX = Math.min(a.maxX, b.maxX);
  const maxY = Math.min(a.maxY, b.maxY);
  if (minX >= maxX || minY >= maxY) return null;
  const fill = opts?.fill ?? 'rgba(255,0,0,0.3)';
  return `<rect x="${minX}" y="${minY}" width="${maxX - minX}" height="${maxY - minY}" fill="${fill}" />`;
}

export function svgPolyline(
  points: Point[],
  opts?: { stroke?: string; strokeWidth?: number },
): string {
  const stroke = opts?.stroke ?? 'black';
  const strokeWidth = opts?.strokeWidth ?? 1;
  const pts = points.map((p) => `${p.x},${p.y}`).join(' ');
  return `<polyline points="${pts}" stroke="${stroke}" stroke-width="${strokeWidth}" fill="none" />`;
}

export function svgDocument(
  fragments: string[],
  viewBox: { x: number; y: number; width: number; height: number },
): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}">${fragments.join('')}</svg>`;
}
