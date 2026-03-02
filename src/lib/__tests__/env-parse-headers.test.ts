import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

describe('parseHeaderJson via getServerEnv', () => {
  const REQUIRED_ENV = {
    OPENAI_API_KEY: 'test-key-123',
    OPENAI_MODEL: 'gpt-5.2',
  };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...process.env };
  });

  async function callGetServerEnv(extraEnv: Record<string, string> = {}) {
    const env = { ...REQUIRED_ENV, ...extraEnv };
    for (const [k, v] of Object.entries(env)) {
      process.env[k] = v;
    }
    const mod = await import('@/lib/server/env');
    return mod.getServerEnv();
  }

  it('extraHeaders is {} when OPENAI_EXTRA_HEADERS_JSON is unset', async () => {
    delete process.env.OPENAI_EXTRA_HEADERS_JSON;
    const result = await callGetServerEnv();
    expect(result.extraHeaders).toEqual({});
  });

  it('extraHeaders is {} when OPENAI_EXTRA_HEADERS_JSON is empty object', async () => {
    const result = await callGetServerEnv({ OPENAI_EXTRA_HEADERS_JSON: '{}' });
    expect(result.extraHeaders).toEqual({});
  });

  it('extraHeaders contains entry from valid JSON', async () => {
    const result = await callGetServerEnv({
      OPENAI_EXTRA_HEADERS_JSON: '{"X-Custom":"value"}',
    });
    expect(result.extraHeaders).toEqual({ 'X-Custom': 'value' });
  });

  it('extraHeaders is {} when JSON is malformed (no throw)', async () => {
    const result = await callGetServerEnv({
      OPENAI_EXTRA_HEADERS_JSON: '{invalid}',
    });
    expect(result.extraHeaders).toEqual({});
  });

  it('extraHeaders is {} when JSON is an array (non-object)', async () => {
    const result = await callGetServerEnv({
      OPENAI_EXTRA_HEADERS_JSON: '["array"]',
    });
    expect(result.extraHeaders).toEqual({});
  });

  it('extraHeaders keeps only string values, drops number and boolean', async () => {
    const result = await callGetServerEnv({
      OPENAI_EXTRA_HEADERS_JSON: '{"a":"str","b":123,"c":true}',
    });
    expect(result.extraHeaders).toEqual({ a: 'str' });
  });
});
