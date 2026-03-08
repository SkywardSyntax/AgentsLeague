export interface StrokeBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface BezierSegment {
  start: { x: number; y: number };
  cp1: { x: number; y: number };
  cp2: { x: number; y: number };
  end: { x: number; y: number };
}

export function svgBounds(
  bounds: StrokeBounds,
  options?: { stroke?: string; fill?: string; label?: string },
): string {
  const w = bounds.maxX - bounds.minX;
  const h = bounds.maxY - bounds.minY;
  const stroke = options?.stroke ?? 'red';
  const fill = options?.fill ?? 'none';
  let svg = `<rect x="${bounds.minX}" y="${bounds.minY}" width="${w}" height="${h}" stroke="${stroke}" fill="${fill}" />`;
  if (options?.label) {
    svg += `<text x="${bounds.minX}" y="${bounds.minY}">${options.label}</text>`;
  }
  return svg;
}

export function svgControlPoints(points: Array<{ x: number; y: number }>, radius = 3): string {
  return points.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="${radius}" fill="blue" />`).join('');
}

export function svgBezierChain(
  segments: BezierSegment[],
  options?: { showControlPoints?: boolean },
): string {
  if (segments.length === 0) return '';
  const first = segments[0]!;
  let d = `M ${first.start.x} ${first.start.y}`;
  for (const seg of segments) {
    d += ` C ${seg.cp1.x} ${seg.cp1.y} ${seg.cp2.x} ${seg.cp2.y} ${seg.end.x} ${seg.end.y}`;
  }
  let svg = `<path d="${d}" fill="none" stroke="black" />`;
  if (options?.showControlPoints) {
    const allPoints = segments.flatMap((s) => [s.cp1, s.cp2]);
    svg += svgControlPoints(allPoints);
  }
  return svg;
}

export function svgIntersection(a: StrokeBounds, b: StrokeBounds): string | null {
  const minX = Math.max(a.minX, b.minX);
  const minY = Math.max(a.minY, b.minY);
  const maxX = Math.min(a.maxX, b.maxX);
  const maxY = Math.min(a.maxY, b.maxY);
  if (minX >= maxX || minY >= maxY) return null;
  return `<rect x="${minX}" y="${minY}" width="${maxX - minX}" height="${maxY - minY}" stroke="green" fill="rgba(0,255,0,0.2)" />`;
}

export function svgPolyline(points: Array<{ x: number; y: number }>): string {
  const pts = points.map((p) => `${p.x},${p.y}`).join(' ');
  return `<polyline points="${pts}" fill="none" stroke="black" />`;
}

export function svgDocument(
  fragments: string[],
  viewBox: { x: number; y: number; width: number; height: number },
): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}">${fragments.join('')}</svg>`;
}
