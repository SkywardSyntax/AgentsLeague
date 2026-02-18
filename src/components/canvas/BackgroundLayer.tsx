'use client';

import { useEffect, useRef } from 'react';
import { useTheme } from '@/hooks/useTheme';

const LIGHT_BG = '#fafaf9'; // hsl(40 6% 98%)
const DARK_BG = '#110f0e';  // hsl(24 10% 4%)

export default function BackgroundLayer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { theme } = useTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bg = theme === 'dark' ? DARK_BG : LIGHT_BG;
    canvas.width = canvas.offsetWidth * devicePixelRatio;
    canvas.height = canvas.offsetHeight * devicePixelRatio;
    ctx.scale(devicePixelRatio, devicePixelRatio);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);
  }, [theme]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 z-0 h-full w-full"
      aria-hidden="true"
    />
  );
}
