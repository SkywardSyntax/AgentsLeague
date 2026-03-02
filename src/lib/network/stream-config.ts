import { z } from 'zod';

export const StreamConfigSchema = z.object({
  timeoutMs: z.number().min(100).max(120000).default(30000),
  retryDelayMs: z.number().min(50).max(30000).default(1000),
  maxReconnects: z.number().int().min(0).max(100).default(5),
  bufferSizeBytes: z.number().int().min(1024).max(10 * 1024 * 1024).default(65536),
  allowedEventTypes: z.array(z.string().min(1)).min(1).default(['message', 'error', 'done']),
});

export type StreamConfig = z.infer<typeof StreamConfigSchema>;

export function validateStreamConfig(input: unknown): StreamConfig {
  return StreamConfigSchema.parse(input);
}
