import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getServerEnv } from '../server/env';

describe('getServerEnv error clarity', () => {
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    savedEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = savedEnv;
  });

  it('missing OPENAI_API_KEY error includes field name', () => {
    delete process.env.OPENAI_API_KEY;
    expect(() => getServerEnv()).toThrowError(/OPENAI_API_KEY/);
  });

  it('error message starts with "Invalid environment:"', () => {
    delete process.env.OPENAI_API_KEY;
    expect(() => getServerEnv()).toThrowError(/^Invalid environment:/);
  });

  it('invalid OPENAI_BASE_URL error includes field name', () => {
    process.env.OPENAI_API_KEY = 'sk-test-key';
    process.env.OPENAI_BASE_URL = 'not-a-url';
    expect(() => getServerEnv()).toThrowError(/OPENAI_BASE_URL/);
  });

  it('valid env returns correct model', () => {
    process.env.OPENAI_API_KEY = 'sk-test-key';
    process.env.OPENAI_MODEL = 'gpt-4o';
    delete process.env.OPENAI_BASE_URL;
    const env = getServerEnv();
    expect(env.model).toBe('gpt-4o');
    expect(env.apiKey).toBe('sk-test-key');
  });

  it('malformed OPENAI_EXTRA_HEADERS_JSON returns empty headers', () => {
    process.env.OPENAI_API_KEY = 'sk-test-key';
    process.env.OPENAI_EXTRA_HEADERS_JSON = '{broken';
    const env = getServerEnv();
    expect(env.extraHeaders).toEqual({});
  });
});
