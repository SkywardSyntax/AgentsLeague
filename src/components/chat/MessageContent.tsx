'use client';

import { Fragment, memo, type ReactNode, useMemo } from 'react';
import { parseStreamingLatex } from '@/lib/latex/stream-tex-parser';
import { parseTextScripts } from '@/lib/latex/text-scripts';
import { LatexSvg } from './LatexSvg';

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

export const MessageContent = memo(function MessageContent({ content }: { content: string }) {
  const segments = useMemo(() => parseStreamingLatex(content), [content]);

  return (
    <div className="text-sm leading-6 whitespace-pre-wrap break-words">
      {segments.map((segment, idx) => (
        <Fragment key={`${segment.kind}-${idx}`}>
          {segment.kind === 'text' ? (
            renderTextWithScripts(segment.value, `segment-${idx}`)
          ) : (
            <LatexSvg tex={segment.value} displayMode={segment.display} />
          )}
        </Fragment>
      ))}
    </div>
  );
});
