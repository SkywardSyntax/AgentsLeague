import { z } from 'zod';

const STORAGE_KEY_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

export const StateConfigSchema = z.object({
  storageKey: z.string().regex(STORAGE_KEY_PATTERN, 'Key must be alphanumeric with dashes/underscores, 1–64 chars').default('app-state'),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Version must be in semver format (e.g. 1.0.0)').default('1.0.0'),
  maxSizeBytes: z.number().int().min(1024).max(50 * 1024 * 1024).default(5 * 1024 * 1024),
  autoSaveIntervalMs: z.number().min(0).max(300000).default(5000),
  enableCompression: z.boolean().default(false),
});

export type StateConfig = z.infer<typeof StateConfigSchema>;

export function validateStateConfig(input: unknown): StateConfig {
  return StateConfigSchema.parse(input);
}
