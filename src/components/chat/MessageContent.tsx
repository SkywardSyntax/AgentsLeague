'use client';

import React, { Fragment, type ReactNode, useMemo } from 'react';
import { parseStreamingLatex } from '@/lib/latex/stream-tex-parser';
import { parseTextScripts } from '@/lib/latex/text-scripts';
import { parseBlocks, type BlockSegment } from '@/lib/markdown/parse-blocks';
import { parseInline, type InlineToken } from '@/lib/markdown/parse-inline';
import { LatexSvg } from './LatexSvg';
import { CodeBlock } from './CodeBlock';

function renderTextWithScripts(content: string, keyPrefix: string): ReactNode[] {
  return parseTextScripts(content).map((token, index) => {
    if (token.kind === 'text') {
      return <Fragment key={`${keyPrefix}-txt-${index}`}>{token.value}</Fragment>;
    }

    if (token.kind === 'sup') {
      return (
        <sup key={`${keyPrefix}-sup-${index}`} className="relative align-baseline text-[0.72em] leading-none">
          {token.value}
        </sup>
      );
    }

    return (
      <sub key={`${keyPrefix}-sub-${index}`} className="relative align-baseline text-[0.72em] leading-none">
        {token.value}
      </sub>
    );
  });
}

function renderInlineTokens(tokens: InlineToken[], keyPrefix: string): ReactNode[] {
  return tokens.map((token, i) => {
    const key = `${keyPrefix}-il-${i}`;
    switch (token.kind) {
      case 'bold':
        return <strong key={key} className="font-semibold">{token.value}</strong>;
      case 'italic':
        return <em key={key}>{token.value}</em>;
      case 'strikethrough':
        return <del key={key}>{token.value}</del>;
      case 'inline_code':
        return (
          <code key={key} className="rounded bg-[var(--color-surface)] px-1.5 py-0.5 text-[0.9em] font-mono">
            {token.value}
          </code>
        );
      case 'link':
        return (
          <a key={key} href={token.href} target="_blank" rel="noopener noreferrer" className="text-[var(--color-accent)] underline">
            {token.text}
          </a>
        );
      case 'image':
        return (
          <img key={key} src={token.src} alt={token.alt} className="my-1 max-w-full rounded" />
        );
      case 'text':
        return <Fragment key={key}>{renderTextWithScripts(token.value, key)}</Fragment>;
    }
  });
}

/** Render paragraph content through LaTeX parser first, then inline markdown for text segments. */
function renderParagraphContent(content: string, keyPrefix: string): ReactNode[] {
  const segments = parseStreamingLatex(content);
  return segments.map((segment, idx) => {
    const key = `${keyPrefix}-seg-${idx}`;
    if (segment.kind === 'latex') {
      return <LatexSvg key={key} tex={segment.value} displayMode={segment.display} />;
    }
    // Text segments get inline markdown parsing
    const inlineTokens = parseInline(segment.value);
    return <Fragment key={key}>{renderInlineTokens(inlineTokens, key)}</Fragment>;
  });
}

function renderBlock(block: BlockSegment, idx: number): ReactNode {
  const key = `block-${idx}`;
  switch (block.kind) {
    case 'code_block':
      return <CodeBlock key={key} code={block.content} language={block.language} />;
    case 'heading': {
      const Tag = `h${block.level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
      const sizes: Record<number, string> = {
        1: 'text-xl font-bold mt-4 mb-2',
        2: 'text-lg font-bold mt-3 mb-1.5',
        3: 'text-base font-semibold mt-2 mb-1',
        4: 'text-sm font-semibold mt-2 mb-1',
        5: 'text-sm font-medium mt-1 mb-0.5',
        6: 'text-sm font-medium mt-1 mb-0.5',
      };
      return (
        <Tag key={key} className={sizes[block.level]}>
          {renderInlineTokens(parseInline(block.content), key)}
        </Tag>
      );
    }
    case 'list': {
      const ListTag = block.ordered ? 'ol' : 'ul';
      return (
        <ListTag key={key} className={`my-1 pl-6 ${block.ordered ? 'list-decimal' : 'list-disc'}`}>
          {block.items.map((item, li) => (
            <li key={`${key}-li-${li}`} className="my-0.5">
              {renderInlineTokens(parseInline(item), `${key}-li-${li}`)}
            </li>
          ))}
        </ListTag>
      );
    }
    case 'blockquote':
      return (
        <blockquote key={key} className="my-2 border-l-3 border-[var(--color-border)] pl-3 text-[var(--color-text-muted)]">
          {block.children
            ? block.children.map((child, ci) => renderBlock(child, ci))
            : renderParagraphContent(block.content, key)}
        </blockquote>
      );
    case 'hr':
      return <hr key={key} className="my-3 border-[var(--color-border)]" />;
    case 'table':
      return (
        <div key={key} className="my-2 overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr>
                {block.headers.map((h, hi) => (
                  <th key={`${key}-th-${hi}`} className="border border-[var(--color-border)] px-3 py-1.5 text-left font-semibold bg-[var(--color-surface)]">
                    {renderInlineTokens(parseInline(h), `${key}-th-${hi}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, ri) => (
                <tr key={`${key}-tr-${ri}`}>
                  {row.map((cell, ci) => (
                    <td key={`${key}-td-${ri}-${ci}`} className="border border-[var(--color-border)] px-3 py-1.5">
                      {renderInlineTokens(parseInline(cell), `${key}-td-${ri}-${ci}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'paragraph':
      return (
        <p key={key} className="my-1 whitespace-pre-wrap">
          {renderParagraphContent(block.content, key)}
        </p>
      );
  }
}

export const MessageContent = React.memo(function MessageContent({ content }: { content: string }) {
  const blocks = useMemo(() => parseBlocks(content), [content]);

  return (
    <div className="text-sm leading-6 break-words">
      {blocks.map((block, idx) => renderBlock(block, idx))}
    </div>
  );
});
