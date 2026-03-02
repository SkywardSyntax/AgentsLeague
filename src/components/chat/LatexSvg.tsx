'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { renderTexToSvg, getCachedSvg } from '@/lib/latex/mathjax-client';
import { formatTexError, isTimeoutError } from '@/lib/latex/tex-errors';

interface LatexSvgProps {
  tex: string;
  displayMode: boolean;
}

const DANGEROUS_TAGS = new Set([
  'script', 'foreignobject', 'iframe', 'object', 'embed', 'applet',
]);

function isSafeSvgAttribute(name: string, value: string): boolean {
  const lower = name.toLowerCase();
  // Block event handler attributes (on*)
  if (lower.startsWith('on')) return false;
  // Block dangerous href/xlink:href values
  if (lower === 'href' || lower === 'xlink:href') {
    // Decode entities and normalize whitespace before checking
    const decoded = value.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/\s+/g, '')
      .toLowerCase();
    if (decoded.startsWith('javascript:') || decoded.startsWith('data:text/html')) return false;
  }
  return true;
}

function sanitizeNode(node: Element): void {
  const children = Array.from(node.children);
  for (const child of children) {
    const tag = child.tagName.toLowerCase();
    if (DANGEROUS_TAGS.has(tag)) {
      child.remove();
      continue;
    }
    // Remove unsafe attributes
    const attrs = Array.from(child.attributes);
    for (const attr of attrs) {
      if (!isSafeSvgAttribute(attr.name, attr.value)) {
        child.removeAttribute(attr.name);
      }
    }
    sanitizeNode(child);
  }
}

export function sanitizeSvg(raw: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(raw, 'image/svg+xml');
  // Detect parse errors (DOMParser embeds a <parsererror> element)
  if (doc.querySelector('parsererror')) return '';
  const root = doc.documentElement;
  // Remove unsafe attributes on the root element itself
  const rootAttrs = Array.from(root.attributes);
  for (const attr of rootAttrs) {
    if (!isSafeSvgAttribute(attr.name, attr.value)) {
      root.removeAttribute(attr.name);
    }
  }
  sanitizeNode(root);
  return new XMLSerializer().serializeToString(root);
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
  const retryButtonRef = useRef<HTMLButtonElement>(null);
  const copyButtonRef = useRef<HTMLButtonElement>(null);
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

  // Focus the retry button (or copy fallback) when an error appears
  useEffect(() => {
    if (error) {
      if (retryButtonRef.current) {
        retryButtonRef.current.focus();
      } else if (copyButtonRef.current) {
        copyButtonRef.current.focus();
      }
    }
  }, [error]);

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
    const showRetry = timedOut && !retried;
    return (
      <code
        className="rounded-md bg-[var(--color-surface-soft)] px-1 py-0.5 text-[var(--color-danger)]"
        title={visibleError}
        role="alert"
        aria-label={`LaTeX error: ${visibleError}`}
      >
        {timedOut ? '⏱ ' : ''}{tex}
        {showRetry && (
          <button
            ref={retryButtonRef}
            className="ml-1 text-xs underline focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:outline-none"
            onClick={handleRetry}
            disabled={retrying}
            aria-label="Retry rendering"
          >
            {retrying ? 'Retrying…' : 'Retry'}
          </button>
        )}
        <button
          ref={copyButtonRef}
          className="ml-1 text-xs underline focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:outline-none"
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

  const ariaLabel = tex.length <= 40 ? `Math: ${tex}` : 'Mathematical expression';

  return (
    <span
      className={displayMode ? 'block overflow-x-auto py-1' : 'inline-block align-middle'}
      role="math"
      aria-label={ariaLabel}
      tabIndex={0}
      title={tex.length > 40 ? tex : undefined}
      dangerouslySetInnerHTML={{ __html: safeSvg }}
    />
  );
}
