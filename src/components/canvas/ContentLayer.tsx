'use client';

import { useRef } from 'react';

export default function ContentLayer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 z-10 h-full w-full"
      aria-hidden="true"
    />
  );
}
