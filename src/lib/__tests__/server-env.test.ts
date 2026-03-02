import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getServerEnv } from '@/lib/server/env';

describe('getServerEnv', () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    // Minimal valid env
    process.env.OPENAI_API_KEY = 'sk-test-key-123';
    delete process.env.OPENAI_MODEL;
    delete process.env.OPENAI_BASE_URL;
    delete process.env.OPENAI_EXTRA_HEADERS_JSON;
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it('throws when OPENAI_API_KEY is missing', () => {
    delete process.env.OPENAI_API_KEY;
    expect(() => getServerEnv()).toThrow(/Invalid environment:/);
  });

  it('throws when OPENAI_API_KEY is empty string', () => {
    process.env.OPENAI_API_KEY = '';
    expect(() => getServerEnv()).toThrow(/Invalid environment:/);
  });

  it('returns apiKey from env', () => {
    const env = getServerEnv();
    expect(env.apiKey).toBe('sk-test-key-123');
  });

  it('defaults OPENAI_MODEL to gpt-5.2 when unset', () => {
    const env = getServerEnv();
    expect(env.model).toBe('gpt-5.2');
  });

  it('uses explicit OPENAI_MODEL when set', () => {
    process.env.OPENAI_MODEL = 'gpt-4o';
    const env = getServerEnv();
    expect(env.model).toBe('gpt-4o');
  });

  it('returns undefined baseUrl when OPENAI_BASE_URL is unset', () => {
    const env = getServerEnv();
    expect(env.baseUrl).toBeUndefined();
  });

  it('returns extraHeaders as empty object when OPENAI_EXTRA_HEADERS_JSON is unset', () => {
    const env = getServerEnv();
    expect(env.extraHeaders).toEqual({});
  });

  it('filters non-string values from OPENAI_EXTRA_HEADERS_JSON', () => {
    process.env.OPENAI_EXTRA_HEADERS_JSON = '{"a": 123, "b": "ok", "c": true}';
    const env = getServerEnv();
    expect(env.extraHeaders).toEqual({ b: 'ok' });
  });

  it('returns empty extraHeaders for array JSON', () => {
    process.env.OPENAI_EXTRA_HEADERS_JSON = '[1,2,3]';
    const env = getServerEnv();
    expect(env.extraHeaders).toEqual({});
  });

  it('returns empty extraHeaders for invalid JSON', () => {
    process.env.OPENAI_EXTRA_HEADERS_JSON = 'not valid json';
    const env = getServerEnv();
    expect(env.extraHeaders).toEqual({});
  });

  it('returns empty extraHeaders for JSON string primitive', () => {
    process.env.OPENAI_EXTRA_HEADERS_JSON = '"just a string"';
    const env = getServerEnv();
    expect(env.extraHeaders).toEqual({});
  });

  it('parses valid header JSON with all string values', () => {
    process.env.OPENAI_EXTRA_HEADERS_JSON = '{"X-Custom": "value", "Authorization": "Bearer token"}';
    const env = getServerEnv();
    expect(env.extraHeaders).toEqual({ 'X-Custom': 'value', Authorization: 'Bearer token' });
  });
});
