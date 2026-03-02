import { z } from 'zod';

const envSchema = z.object({
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().min(1).default('gpt-5.2'),
  OPENAI_BASE_URL: z.string().url().optional(),
  OPENAI_EXTRA_HEADERS_JSON: z.string().optional(),
});

function parseHeaderJson(raw?: string): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string') out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function getServerEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment: ${errors}`);
  }

  return {
    apiKey: parsed.data.OPENAI_API_KEY,
    model: parsed.data.OPENAI_MODEL,
    baseUrl: parsed.data.OPENAI_BASE_URL,
    extraHeaders: parseHeaderJson(parsed.data.OPENAI_EXTRA_HEADERS_JSON),
  };
}
