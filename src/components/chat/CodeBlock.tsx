'use client';

import { useState, useCallback } from 'react';

interface CodeBlockProps {
  code: string;
  language: string;
}

export function CodeBlock({ code, language }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // Fallback for insecure contexts
      const textarea = document.createElement('textarea');
      textarea.value = code;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [code]);

  return (
    <div
      className="group relative my-2 rounded-lg bg-[var(--color-code-bg)] text-sm"
      aria-label={language ? `Code block in ${language}` : 'Code block'}
    >
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-1.5">
        {language ? (
          <span className="text-xs text-[var(--color-code-muted)]">{language}</span>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={handleCopy}
          className="rounded px-2 py-0.5 text-xs text-[var(--color-code-muted)] transition-colors hover:bg-white/10 hover:text-[var(--color-code-text)]"
          aria-label="Copy code"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto p-4">
        <code className="font-mono text-sm leading-relaxed text-[var(--color-code-text)]">
          {code}
        </code>
      </pre>
    </div>
  );
}
