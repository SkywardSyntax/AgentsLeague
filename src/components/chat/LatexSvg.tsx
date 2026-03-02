'use client';

import { useEffect, useState } from 'react';
import { renderTexToSvg, getCachedSvg } from '@/lib/latex/mathjax-client';
import { formatTexError, isTimeoutError } from '@/lib/latex/tex-errors';

interface LatexSvgProps {
  tex: string;
  displayMode: boolean;
}

const DANGEROUS_SVG_PATTERN =
  /(<script[\s>]|on\w+\s*=|javascript\s*:|data\s*:\s*text\/html)/i;

function sanitizeSvg(raw: string): string {
  let svg = raw.replace(/<script[\s\S]*?<\/script\s*>/gi, '');
  svg = svg.replace(/\s*on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '');
  svg = svg.replace(/href\s*=\s*"javascript:[^"]*"/gi, 'href=""');
  svg = svg.replace(/href\s*=\s*'javascript:[^']*'/gi, "href=''");
  if (DANGEROUS_SVG_PATTERN.test(svg)) return '';
  return svg;
}

export function LatexSvg({ tex, displayMode }: LatexSvgProps) {
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const cached = getCachedSvg(tex, displayMode);

  useEffect(() => {
    let cancelled = false;
    if (cached) return;

    (async () => {
      try {
        const rendered = await renderTexToSvg(tex, displayMode);
        if (!cancelled) {
          setSvg(rendered);
          setError(null);
          setTimedOut(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(formatTexError(err, tex));
          setTimedOut(isTimeoutError(err));
          setSvg('');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cached, displayMode, tex]);

  const visibleSvg = cached ?? svg;
  const visibleError = cached ? null : error;

  if (visibleError) {
    return (
      <code
        className="rounded-md bg-[var(--color-surface-soft)] px-1 py-0.5 text-[var(--color-danger)]"
        title={visibleError}
        role="alert"
        aria-label={`LaTeX error: ${visibleError}`}
      >
        {timedOut ? '⏱ ' : ''}{tex}
      </code>
    );
  }

  if (!visibleSvg) {
    return <span className="text-[var(--color-text-muted)]">Rendering…</span>;
  }

  const safeSvg = sanitizeSvg(visibleSvg);

  return (
    <span
      className={displayMode ? 'block overflow-x-auto py-1' : 'inline-block align-middle'}
      role="math"
      aria-label={`LaTeX: ${tex}`}
      dangerouslySetInnerHTML={{ __html: safeSvg }}
    />
  );
}
