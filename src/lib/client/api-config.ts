import { z } from 'zod';

const URL_PATTERN = /^https?:\/\/.+/;

export const ApiConfigSchema = z.object({
  baseUrl: z.string().regex(URL_PATTERN, 'Must be a valid HTTP/HTTPS URL').default('http://localhost:3000'),
  timeoutMs: z.number().min(100).max(120000).default(30000),
  rateLimit: z.number().int().min(1).max(10000).default(60),
  corsOrigins: z.array(z.string().regex(URL_PATTERN, 'Each CORS origin must be a valid URL')).default([]),
  maxRetries: z.number().int().min(0).max(20).default(3),
  enableLogging: z.boolean().default(false),
});

export type ApiConfig = z.infer<typeof ApiConfigSchema>;

export function validateApiConfig(input: unknown): ApiConfig {
  return ApiConfigSchema.parse(input);
}
