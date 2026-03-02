import { z } from 'zod';

export const TestConfigSchema = z.object({
  testTimeoutMs: z.number().min(100).max(600000).default(5000),
  parallelism: z.number().int().min(1).max(32).default(4),
  retryCount: z.number().int().min(0).max(10).default(0),
  bailThreshold: z.number().int().min(0).default(0),
  coverageMinimum: z.number().min(0).max(100).default(0),
  verbose: z.boolean().default(false),
});

export type TestConfig = z.infer<typeof TestConfigSchema>;

export function validateTestConfig(input: unknown): TestConfig {
  return TestConfigSchema.parse(input);
}
