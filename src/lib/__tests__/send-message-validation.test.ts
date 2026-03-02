import { describe, expect, it } from 'vitest';
import { sanitizeUserMessage } from '@/lib/client/message-validation';

describe('sanitizeUserMessage', () => {
  it('returns cleaned message for normal input', () => {
    expect(sanitizeUserMessage('Hello world')).toBe('Hello world');
  });

  it('trims whitespace from input', () => {
    expect(sanitizeUserMessage('  hello  ')).toBe('hello');
  });

  it('returns null for empty string after trim', () => {
    expect(sanitizeUserMessage('')).toBeNull();
    expect(sanitizeUserMessage('   ')).toBeNull();
  });

  it('returns null for message exceeding 20000 chars', () => {
    const long = 'a'.repeat(20_001);
    expect(sanitizeUserMessage(long)).toBeNull();
  });

  it('accepts message of exactly 20000 chars', () => {
    const exact = 'a'.repeat(20_000);
    expect(sanitizeUserMessage(exact)).toBe(exact);
  });

  it('returns null for message consisting only of zero-width characters', () => {
    // \u200B = zero-width space, \u200D = zero-width joiner, \uFEFF = BOM
    expect(sanitizeUserMessage('\u200B\u200D\uFEFF')).toBeNull();
  });

  it('strips zero-width characters from normal message', () => {
    expect(sanitizeUserMessage('he\u200Bllo\u200D world\uFEFF')).toBe('hello world');
  });

  it('does not crash on HTML tags in message', () => {
    const result = sanitizeUserMessage('<script>alert(1)</script>');
    expect(result).toBe('<script>alert(1)</script>');
  });

  it('strips null bytes from message', () => {
    const result = sanitizeUserMessage('hello\x00world');
    expect(result).toBe('helloworld');
  });

  it('accepts very long single line at exactly max length', () => {
    const long = 'x'.repeat(20_000);
    expect(sanitizeUserMessage(long)).toBe(long);
  });

  it('returns null for message of only newlines', () => {
    expect(sanitizeUserMessage('\n\n\n')).toBeNull();
  });

  it('preserves tab characters', () => {
    expect(sanitizeUserMessage('hello\tworld')).toBe('hello\tworld');
  });

  it('strips BEL character (\\x07)', () => {
    expect(sanitizeUserMessage('hello\x07world')).toBe('helloworld');
  });

  it('strips ESC character (\\x1B)', () => {
    expect(sanitizeUserMessage('hello\x1Bworld')).toBe('helloworld');
  });

  it('preserves valid tab and newline', () => {
    expect(sanitizeUserMessage('line1\n\tline2')).toBe('line1\n\tline2');
  });

  it('replaces lone surrogate \\uD800 with \\uFFFD', () => {
    const result = sanitizeUserMessage('before\uD800after');
    expect(result).toBe('before\uFFFDafter');
  });

  it('preserves valid surrogate pair (emoji)', () => {
    const emoji = '😀';
    expect(sanitizeUserMessage(`hello ${emoji} world`)).toBe(`hello ${emoji} world`);
  });

  it('strips multiple control chars in one message', () => {
    expect(sanitizeUserMessage('a\x00b\x07c\x1Bd')).toBe('abcd');
  });

  it('preserves carriage return (\\r)', () => {
    expect(sanitizeUserMessage('line1\r\nline2')).toBe('line1\r\nline2');
  });
});
