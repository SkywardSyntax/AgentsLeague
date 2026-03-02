'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
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

function copyToClipboard(text: string): void {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => {
      fallbackCopy(text);
    });
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text: string): void {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand('copy');
  } catch {
    // silent fallback failure
  }
  document.body.removeChild(textarea);
}

export function LatexSvg({ tex, displayMode }: LatexSvgProps) {
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retried, setRetried] = useState(false);
  const texRef = useRef(tex);
  texRef.current = tex;
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
          setRetried(false);
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

  const handleRetry = useCallback(async () => {
    if (retrying) return;
    const currentTex = texRef.current;
    setRetrying(true);
    try {
      const rendered = await renderTexToSvg(currentTex, displayMode, 10_000);
      if (texRef.current === currentTex) {
        setSvg(rendered);
        setError(null);
        setTimedOut(false);
      }
    } catch (err) {
      if (texRef.current === currentTex) {
        setError(formatTexError(err, currentTex));
        setTimedOut(isTimeoutError(err));
        setRetried(true);
      }
    } finally {
      setRetrying(false);
    }
  }, [retrying, displayMode]);

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
        {timedOut && !retried && (
          <button
            className="ml-1 text-xs underline"
            onClick={handleRetry}
            disabled={retrying}
            aria-label="Retry rendering"
          >
            {retrying ? 'Retrying…' : 'Retry'}
          </button>
        )}
        <button
          className="ml-1 text-xs underline"
          onClick={() => copyToClipboard(tex)}
          aria-label="Copy TeX to clipboard"
        >
          Copy
        </button>
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
