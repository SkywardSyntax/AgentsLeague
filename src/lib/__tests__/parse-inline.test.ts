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
