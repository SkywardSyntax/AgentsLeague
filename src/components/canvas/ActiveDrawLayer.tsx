'use client';

import { useRef } from 'react';

export default function ActiveDrawLayer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 z-20 h-full w-full"
      aria-hidden="true"
    />
  );
}
