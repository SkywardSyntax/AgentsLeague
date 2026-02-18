import { z } from "zod";

const envSchema = z.object({
  // ── Required ──
  OPENAI_API_KEY: z
    .string()
    .min(1, "OPENAI_API_KEY is required")
    .refine((k) => k !== "sk-proj-your-key-here", "Replace placeholder API key"),

  // ── Model ──
  OPENAI_MODEL: z.string().default("gpt-4o"),
  OPENAI_FALLBACK_MODEL: z.string().default("gpt-4o-mini"),
  OPENAI_REASONING_MODEL: z.string().default("o4-mini"),

  // ── Generation ──
  OPENAI_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.3),
  OPENAI_MAX_TOKENS: z.coerce.number().int().positive().default(4096),
  OPENAI_TOP_P: z.coerce.number().min(0).max(1).default(0.9),

  // ── Reliability ──
  OPENAI_MAX_RETRIES: z.coerce.number().int().nonnegative().default(3),
  OPENAI_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(30),
  OPENAI_STREAM: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),

  // ── Canvas ──
  CANVAS_WIDTH: z.coerce.number().int().positive().default(1200),
  CANVAS_HEIGHT: z.coerce.number().int().positive().default(800),
  MAX_ELEMENTS: z.coerce.number().int().positive().default(200),
  MAX_DRAW_ITERATIONS: z.coerce.number().int().positive().default(15),

  // ── Caching ──
  REDIS_URL: z.string().url().optional(),
  CACHE_TTL_SECONDS: z.coerce.number().int().nonnegative().default(3600),

  // ── Logging ──
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  LOG_OPENAI_REQUESTS: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.issues
      .map((i) => `  ✗ ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Environment validation failed:\n${formatted}`);
  }

  return result.data;
}

export const env: Env = validateEnv();
