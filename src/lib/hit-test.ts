import type { DrawElement, Point } from '@/types';

/** Basic point-in-bounding-box hit test. */
export function hitTest(point: Point, element: DrawElement): boolean {
  switch (element.type) {
    case 'rect':
    case 'text':
    case 'image':
      return (
        point.x >= element.x &&
        point.x <= element.x + element.w &&
        point.y >= element.y &&
        point.y <= element.y + element.h
      );
    case 'ellipse':
      return (
        ((point.x - element.x) ** 2) / (element.rx ** 2) +
          ((point.y - element.y) ** 2) / (element.ry ** 2) <=
        1
      );
    default:
      return false;
  }
}
