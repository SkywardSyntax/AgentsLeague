import type { DrawElement } from '@/types/agent';

export interface AlignGuide {
  axis: 'x' | 'y';
  value: number;
  label?: string;
}

/** Default tolerance in pixels for considering two edges aligned. */
const ALIGN_TOLERANCE = 5;

/**
 * Extract the meaningful edge coordinates from a DrawElement.
 * Returns { xs: [...], ys: [...] } — the set of x and y edge values.
 */
function edgesOf(el: DrawElement): { xs: number[]; ys: number[] } {
  switch (el.type) {
    case 'rect':
      return { xs: [el.x, el.x + el.w], ys: [el.y, el.y + el.h] };
    case 'ellipse':
      return { xs: [el.cx - el.rx, el.cx, el.cx + el.rx], ys: [el.cy - el.ry, el.cy, el.cy + el.ry] };
    case 'line':
    case 'arrow':
      return { xs: [el.from.x, el.to.x], ys: [el.from.y, el.to.y] };
    case 'text':
    case 'latex':
      return { xs: [el.x], ys: [el.y] };
    default:
      // Math primitives with x/y/width/height
      if ('x' in el && 'y' in el) {
        const x = (el as { x: number }).x;
        const y = (el as { y: number }).y;
        const w = 'width' in el ? (el as { width: number }).width : 0;
        const h = 'height' in el ? (el as { height: number }).height : 0;
        return { xs: [x, x + w], ys: [y, y + h] };
      }
      return { xs: [], ys: [] };
  }
}

/**
 * Compute alignment guides for a set of elements.
 * Finds pairs of elements that share an x or y coordinate edge
 * (within a tolerance of 5px) and returns guide lines at those coordinates.
 */
export function computeAlignmentGuides(
  elements: DrawElement[],
  tolerance: number = ALIGN_TOLERANCE,
): AlignGuide[] {
  if (elements.length < 2) return [];

  const allXEdges: { value: number; elIndex: number }[] = [];
  const allYEdges: { value: number; elIndex: number }[] = [];

  for (let i = 0; i < elements.length; i++) {
    const { xs, ys } = edgesOf(elements[i]!);
    for (const x of xs) allXEdges.push({ value: x, elIndex: i });
    for (const y of ys) allYEdges.push({ value: y, elIndex: i });
  }

  const guides: AlignGuide[] = [];
  const seen = new Set<string>();

  // Find x-aligned pairs (vertical guide lines)
  for (let i = 0; i < allXEdges.length; i++) {
    for (let j = i + 1; j < allXEdges.length; j++) {
      if (allXEdges[i]!.elIndex === allXEdges[j]!.elIndex) continue;
      if (Math.abs(allXEdges[i]!.value - allXEdges[j]!.value) <= tolerance) {
        const avg = (allXEdges[i]!.value + allXEdges[j]!.value) / 2;
        const key = `x:${Math.round(avg)}`;
        if (!seen.has(key)) {
          seen.add(key);
          guides.push({ axis: 'x', value: avg, label: `x=${Math.round(avg)}` });
        }
      }
    }
  }

  // Find y-aligned pairs (horizontal guide lines)
  for (let i = 0; i < allYEdges.length; i++) {
    for (let j = i + 1; j < allYEdges.length; j++) {
      if (allYEdges[i]!.elIndex === allYEdges[j]!.elIndex) continue;
      if (Math.abs(allYEdges[i]!.value - allYEdges[j]!.value) <= tolerance) {
        const avg = (allYEdges[i]!.value + allYEdges[j]!.value) / 2;
        const key = `y:${Math.round(avg)}`;
        if (!seen.has(key)) {
          seen.add(key);
          guides.push({ axis: 'y', value: avg, label: `y=${Math.round(avg)}` });
        }
      }
    }
  }

  return guides;
}
