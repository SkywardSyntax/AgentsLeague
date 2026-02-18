'use client';

import { useCallback, useState } from 'react';
import type { Camera, Point } from '@/types';

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5.0;

export function useCamera(initial?: Partial<Camera>) {
  const [camera, setCamera] = useState<Camera>({
    x: initial?.x ?? 0,
    y: initial?.y ?? 0,
    zoom: initial?.zoom ?? 1,
  });

  const pan = useCallback((dx: number, dy: number) => {
    setCamera((prev) => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
  }, []);

  const zoomTo = useCallback((newZoom: number, anchor?: Point) => {
    setCamera((prev) => {
      const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, newZoom));
      if (!anchor) return { ...prev, zoom: clamped };
      const scale = clamped / prev.zoom;
      return {
        x: anchor.x - (anchor.x - prev.x) * scale,
        y: anchor.y - (anchor.y - prev.y) * scale,
        zoom: clamped,
      };
    });
  }, []);

  const screenToWorld = useCallback(
    (screenX: number, screenY: number): Point => ({
      x: (screenX - camera.x) / camera.zoom,
      y: (screenY - camera.y) / camera.zoom,
    }),
    [camera],
  );

  return { camera, setCamera, pan, zoomTo, screenToWorld } as const;
}
