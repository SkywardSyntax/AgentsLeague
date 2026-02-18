import type { Camera, Point } from '@/types';

/** Screen coordinates → world coordinates. */
export function screenToWorld(
  screenX: number,
  screenY: number,
  camera: Camera,
): Point {
  return {
    x: (screenX - camera.x) / camera.zoom,
    y: (screenY - camera.y) / camera.zoom,
  };
}

/** World coordinates → screen coordinates. */
export function worldToScreen(
  worldX: number,
  worldY: number,
  camera: Camera,
): Point {
  return {
    x: worldX * camera.zoom + camera.x,
    y: worldY * camera.zoom + camera.y,
  };
}

/** Linear interpolation between two cameras for smooth transitions. */
export function lerpCamera(
  from: Camera,
  to: Camera,
  t: number,
): Camera {
  const ease = 1 - Math.pow(1 - t, 3); // cubic ease-out
  return {
    x: from.x + (to.x - from.x) * ease,
    y: from.y + (to.y - from.y) * ease,
    zoom: from.zoom + (to.zoom - from.zoom) * ease,
  };
}

/** Clamp a number to [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
