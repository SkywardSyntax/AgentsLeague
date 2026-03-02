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

  it('handles unicode null bytes', () => {
    const result = sanitizeUserMessage('hello\x00world');
    expect(result).toBe('hello\x00world');
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
});
