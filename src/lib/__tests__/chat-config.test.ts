import { describe, it, expect } from 'vitest';
import { validateChatConfig } from '@/lib/chat/chat-config';

describe('ChatConfigSchema', () => {
  it('accepts a fully valid configuration', () => {
    const config = validateChatConfig({
      maxMessageLength: 8000, maxThreads: 100, maxHistory: 500,
      typingIndicatorTimeoutMs: 5000, allowedRoles: ['user', 'assistant', 'system'],
    });
    expect(config.maxMessageLength).toBe(8000);
    expect(config.allowedRoles).toContain('system');
  });

  it('applies defaults when fields are omitted', () => {
    const config = validateChatConfig({});
    expect(config.maxMessageLength).toBe(4000);
    expect(config.maxThreads).toBe(50);
    expect(config.maxHistory).toBe(200);
    expect(config.enableMarkdown).toBe(true);
  });

  it('rejects zero message length', () => {
    expect(() => validateChatConfig({ maxMessageLength: 0 })).toThrow();
  });

  it('rejects negative thread count', () => {
    expect(() => validateChatConfig({ maxThreads: -1 })).toThrow();
  });

  it('rejects history exceeding max', () => {
    expect(() => validateChatConfig({ maxHistory: 10001 })).toThrow();
  });

  it('rejects typing timeout below minimum', () => {
    expect(() => validateChatConfig({ typingIndicatorTimeoutMs: 50 })).toThrow();
  });

  it('rejects typing timeout above maximum', () => {
    expect(() => validateChatConfig({ typingIndicatorTimeoutMs: 60000 })).toThrow();
  });

  it('rejects invalid role values', () => {
    expect(() => validateChatConfig({ allowedRoles: ['admin'] })).toThrow();
  });

  it('rejects NaN values', () => {
    expect(() => validateChatConfig({ maxMessageLength: NaN })).toThrow();
  });

  it('validates boundary values exactly at limits', () => {
    const config = validateChatConfig({
      maxMessageLength: 1, maxThreads: 1000, maxHistory: 10000,
    });
    expect(config.maxMessageLength).toBe(1);
    expect(config.maxThreads).toBe(1000);
    expect(config.maxHistory).toBe(10000);
  });
});
