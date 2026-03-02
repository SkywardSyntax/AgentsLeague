import { describe, it, expect } from 'vitest';
import { parseInline, sanitizeHref } from '../markdown/parse-inline';

describe('parseInline', () => {
  it('returns plain text as-is', () => {
    expect(parseInline('hello world')).toEqual([
      { kind: 'text', value: 'hello world' },
    ]);
  });

  it('parses bold with **', () => {
    expect(parseInline('**bold**')).toEqual([
      { kind: 'bold', value: 'bold' },
    ]);
  });

  it('parses bold with __', () => {
    expect(parseInline('__bold__')).toEqual([
      { kind: 'bold', value: 'bold' },
    ]);
  });

  it('parses italic with *', () => {
    expect(parseInline('*italic*')).toEqual([
      { kind: 'italic', value: 'italic' },
    ]);
  });

  it('parses italic with _', () => {
    expect(parseInline('_italic_')).toEqual([
      { kind: 'italic', value: 'italic' },
    ]);
  });

  it('parses inline code', () => {
    expect(parseInline('use `code` here')).toEqual([
      { kind: 'text', value: 'use ' },
      { kind: 'inline_code', value: 'code' },
      { kind: 'text', value: ' here' },
    ]);
  });

  it('parses links', () => {
    expect(parseInline('[click](https://example.com)')).toEqual([
      { kind: 'link', text: 'click', href: 'https://example.com' },
    ]);
  });

  it('parses mixed bold and italic', () => {
    expect(parseInline('**bold** and *italic*')).toEqual([
      { kind: 'bold', value: 'bold' },
      { kind: 'text', value: ' and ' },
      { kind: 'italic', value: 'italic' },
    ]);
  });

  it('handles unclosed backtick as text', () => {
    expect(parseInline('unclosed `code')).toEqual([
      { kind: 'text', value: 'unclosed `code' },
    ]);
  });

  it('handles unclosed bold markers as text', () => {
    expect(parseInline('**unclosed bold')).toEqual([
      { kind: 'text', value: '**unclosed bold' },
    ]);
  });

  it('strips javascript: links', () => {
    const result = parseInline('[xss](javascript:alert(1))');
    // Should render as plain text since href is sanitized to empty
    expect(result).toEqual([
      { kind: 'text', value: 'xss' },
    ]);
  });

  it('strips data: links', () => {
    const result = parseInline('[evil](data:text/html,<script>alert(1)</script>)');
    expect(result).toEqual([
      { kind: 'text', value: 'evil' },
    ]);
  });

  it('allows mailto: links', () => {
    expect(parseInline('[email](mailto:a@b.com)')).toEqual([
      { kind: 'link', text: 'email', href: 'mailto:a@b.com' },
    ]);
  });

  it('allows relative links', () => {
    expect(parseInline('[file](./readme.md)')).toEqual([
      { kind: 'link', text: 'file', href: './readme.md' },
    ]);
  });

  it('parses strikethrough with ~~', () => {
    expect(parseInline('~~deleted~~')).toEqual([
      { kind: 'strikethrough', value: 'deleted' },
    ]);
  });

  it('parses strikethrough mixed with text', () => {
    expect(parseInline('keep ~~removed~~ this')).toEqual([
      { kind: 'text', value: 'keep ' },
      { kind: 'strikethrough', value: 'removed' },
      { kind: 'text', value: ' this' },
    ]);
  });

  it('treats unclosed ~~ as plain text', () => {
    expect(parseInline('~~no close')).toEqual([
      { kind: 'text', value: '~~no close' },
    ]);
  });

  it('handles ***bold italic*** by emitting bold and italic tokens', () => {
    const tokens = parseInline('***bold italic***');
    expect(tokens).toEqual([
      { kind: 'bold', value: 'bold italic' },
      { kind: 'italic', value: 'bold italic' },
    ]);
  });

  it('does not parse _snake_case_ as italic (word boundary)', () => {
    expect(parseInline('use_snake_case_here')).toEqual([
      { kind: 'text', value: 'use_snake_case_here' },
    ]);
  });

  it('parses _italic_ at word boundary with underscore', () => {
    expect(parseInline('this is _italic_ text')).toEqual([
      { kind: 'text', value: 'this is ' },
      { kind: 'italic', value: 'italic' },
      { kind: 'text', value: ' text' },
    ]);
  });

  it('handles ~~~ as ~~ + remaining text', () => {
    const tokens = parseInline('~~~strikethrough~~~');
    // Greedy: first ~~ consumed, finds closing ~~ leaving trailing ~
    expect(tokens).toEqual([
      { kind: 'strikethrough', value: '~strikethrough' },
      { kind: 'text', value: '~' },
    ]);
  });

  // --- 3B: Image syntax ---

  it('parses image syntax into image token', () => {
    const tokens = parseInline('![alt text](https://img.png)');
    expect(tokens).toEqual([
      { kind: 'image', alt: 'alt text', src: 'https://img.png' },
    ]);
  });

  it('sanitizes javascript: URLs in image src', () => {
    const tokens = parseInline('![x](javascript:alert(1))');
    // Unsafe src — falls back to plain text
    expect(tokens.every(t => t.kind !== 'image')).toBe(true);
  });

  it('autolinks bare https URLs', () => {
    const tokens = parseInline('visit https://example.com today');
    expect(tokens).toEqual([
      { kind: 'text', value: 'visit ' },
      { kind: 'link', text: 'https://example.com', href: 'https://example.com' },
      { kind: 'text', value: ' today' },
    ]);
  });

  it('does not autolink URLs inside existing link text', () => {
    const tokens = parseInline('[https://a.com](https://b.com)');
    expect(tokens).toEqual([
      { kind: 'link', text: 'https://a.com', href: 'https://b.com' },
    ]);
  });

  // --- Iter 6 3-C: edge cases for unclosed delimiters and autolinks ---

  it('treats unclosed __ as plain text', () => {
    expect(parseInline('__bold but never closed')).toEqual([
      { kind: 'text', value: '__bold but never closed' },
    ]);
  });

  it('treats **** as empty bold token', () => {
    // indexOf('**', 2) finds pos 2 → empty bold value
    const tokens = parseInline('****');
    expect(tokens).toEqual([{ kind: 'bold', value: '' }]);
  });

  it('parses two separate strikethrough tokens', () => {
    const tokens = parseInline('text ~~strike~~ more ~~also~~');
    expect(tokens).toEqual([
      { kind: 'text', value: 'text ' },
      { kind: 'strikethrough', value: 'strike' },
      { kind: 'text', value: ' more ' },
      { kind: 'strikethrough', value: 'also' },
    ]);
  });

  it('parses two autolink URLs in one string', () => {
    const tokens = parseInline('Visit https://a.com and https://b.com');
    expect(tokens).toEqual([
      { kind: 'text', value: 'Visit ' },
      { kind: 'link', text: 'https://a.com', href: 'https://a.com' },
      { kind: 'text', value: ' and ' },
      { kind: 'link', text: 'https://b.com', href: 'https://b.com' },
    ]);
  });

  it('mixes explicit link with autolink', () => {
    const tokens = parseInline('[link](https://a.com) https://bare.com');
    expect(tokens).toEqual([
      { kind: 'link', text: 'link', href: 'https://a.com' },
      { kind: 'text', value: ' ' },
      { kind: 'link', text: 'https://bare.com', href: 'https://bare.com' },
    ]);
  });

  it('parses multiple underscore italics in one line', () => {
    const tokens = parseInline('check _this_ and _that_');
    expect(tokens).toEqual([
      { kind: 'text', value: 'check ' },
      { kind: 'italic', value: 'this' },
      { kind: 'text', value: ' and ' },
      { kind: 'italic', value: 'that' },
    ]);
  });

  it('handles nested image in link gracefully', () => {
    // [![alt](img.png)](url) — parser should handle without crashing
    const tokens = parseInline('[![alt](https://img.png)](https://url.com)');
    // The exact output depends on parser behavior; key is no crash
    expect(tokens.length).toBeGreaterThan(0);
  });

  // --- iter7 3C: complex mixed-token edge cases ---

  it('inline code preserves bold markers as literal text', () => {
    const tokens = parseInline('`**not bold**`');
    expect(tokens).toEqual([
      { kind: 'inline_code', value: '**not bold**' },
    ]);
  });

  it('bold wrapping underscored text is a single bold token (token-linear)', () => {
    const tokens = parseInline('**bold _italic_ bold**');
    expect(tokens).toEqual([
      { kind: 'bold', value: 'bold _italic_ bold' },
    ]);
  });

  it('four underscores ____ produce empty bold token', () => {
    const tokens = parseInline('____');
    expect(tokens).toEqual([
      { kind: 'bold', value: '' },
    ]);
  });

  it('adjacent *a**b* produces two italic tokens without crash', () => {
    const tokens = parseInline('*a**b*');
    expect(tokens.length).toBeGreaterThan(0);
    expect(tokens[0]).toEqual({ kind: 'italic', value: 'a' });
  });
});

describe('sanitizeHref', () => {
  it('allows https', () => expect(sanitizeHref('https://example.com')).toBe('https://example.com'));
  it('allows http', () => expect(sanitizeHref('http://example.com')).toBe('http://example.com'));
  it('allows mailto', () => expect(sanitizeHref('mailto:a@b.com')).toBe('mailto:a@b.com'));
  it('blocks javascript:', () => expect(sanitizeHref('javascript:alert(1)')).toBe(''));
  it('blocks data:', () => expect(sanitizeHref('data:text/html,x')).toBe(''));
  it('blocks vbscript:', () => expect(sanitizeHref('vbscript:foo')).toBe(''));
  it('allows relative paths', () => expect(sanitizeHref('./foo')).toBe('./foo'));
});
