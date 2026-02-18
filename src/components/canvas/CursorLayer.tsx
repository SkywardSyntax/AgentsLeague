'use client';

import { useRef } from 'react';

export default function CursorLayer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 z-30 h-full w-full pointer-events-none"
      aria-hidden="true"
    />
  );
}
