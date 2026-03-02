'use client';

import { useEffect, useState } from 'react';
import { renderTexToSvg } from '@/lib/latex/mathjax-client';

interface LatexSvgProps {
  tex: string;
  displayMode: boolean;
}

const svgCache = new Map<string, string>();
const MAX_SVG_CACHE = 300;

export function LatexSvg({ tex, displayMode }: LatexSvgProps) {
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  // Cache key uses raw input; renderTexToSvg normalizes internally exactly once.
  const cacheKey = `svg:${displayMode ? 'D' : 'I'}:${tex}`;
  const cached = svgCache.get(cacheKey);

  useEffect(() => {
    let cancelled = false;
    if (cached) return;

    (async () => {
      try {
        const rendered = await renderTexToSvg(tex, displayMode);
        if (!cancelled) {
          if (svgCache.size > MAX_SVG_CACHE) {
            const oldest = svgCache.keys().next().value as string | undefined;
            if (oldest) svgCache.delete(oldest);
          }
          svgCache.set(cacheKey, rendered);
          setSvg(rendered);
          setError(null);
        }
      } catch {
        if (!cancelled) {
          setError('Invalid LaTeX');
          setSvg('');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cached, cacheKey, displayMode, tex]);

  const visibleSvg = cached ?? svg;
  const visibleError = cached ? null : error;

  if (visibleError) {
    return (
      <code className="rounded-md bg-[var(--color-surface-soft)] px-1 py-0.5 text-[var(--color-danger)]">
        {tex}
      </code>
    );
  }

  if (!visibleSvg) {
    return <span className="text-[var(--color-text-muted)]">Rendering…</span>;
  }

  return (
    <span
      className={displayMode ? 'block overflow-x-auto py-1' : 'inline-block align-middle'}
      role="math"
      aria-label={`LaTeX: ${tex}`}
      dangerouslySetInnerHTML={{ __html: visibleSvg }}
    />
  );
}
