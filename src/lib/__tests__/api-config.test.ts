import { describe, it, expect } from 'vitest';
import { validateApiConfig } from '@/lib/client/api-config';

describe('ApiConfigSchema', () => {
  it('accepts a fully valid configuration', () => {
    const config = validateApiConfig({
      baseUrl: 'https://api.example.com', timeoutMs: 15000,
      rateLimit: 100, corsOrigins: ['https://app.example.com'], maxRetries: 5,
    });
    expect(config.baseUrl).toBe('https://api.example.com');
    expect(config.rateLimit).toBe(100);
  });

  it('applies defaults when fields are omitted', () => {
    const config = validateApiConfig({});
    expect(config.baseUrl).toBe('http://localhost:3000');
    expect(config.timeoutMs).toBe(30000);
    expect(config.rateLimit).toBe(60);
    expect(config.corsOrigins).toEqual([]);
    expect(config.maxRetries).toBe(3);
  });

  it('rejects invalid base URL', () => {
    expect(() => validateApiConfig({ baseUrl: 'not-a-url' })).toThrow();
    expect(() => validateApiConfig({ baseUrl: 'ftp://files.example.com' })).toThrow();
  });

  it('rejects timeout below 100ms', () => {
    expect(() => validateApiConfig({ timeoutMs: 50 })).toThrow();
  });

  it('rejects timeout above 120000ms', () => {
    expect(() => validateApiConfig({ timeoutMs: 130000 })).toThrow();
  });

  it('rejects rate limit of zero', () => {
    expect(() => validateApiConfig({ rateLimit: 0 })).toThrow();
  });

  it('rejects invalid CORS origin', () => {
    expect(() => validateApiConfig({ corsOrigins: ['not-valid'] })).toThrow();
  });

  it('rejects negative max retries', () => {
    expect(() => validateApiConfig({ maxRetries: -1 })).toThrow();
  });

  it('allows empty CORS origins array', () => {
    const config = validateApiConfig({ corsOrigins: [] });
    expect(config.corsOrigins).toEqual([]);
  });

  it('allows partial override while keeping other defaults', () => {
    const config = validateApiConfig({
      baseUrl: 'https://api.prod.com', maxRetries: 0,
    });
    expect(config.baseUrl).toBe('https://api.prod.com');
    expect(config.maxRetries).toBe(0);
    expect(config.timeoutMs).toBe(30000);
    expect(config.rateLimit).toBe(60);
  });
});
