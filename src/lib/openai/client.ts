/**
 * OpenAI client wrapper — initializes the SDK from env config
 * and provides model validation utilities.
 *
 * Uses the Responses API (`client.responses.create`).
 */

import OpenAI from 'openai';
import { env } from '@/lib/env';

// ── Valid models for whiteboard drawing ─────────────────────────────

const SUPPORTED_MODELS = [
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4.1',
  'o4-mini',
] as const;

export type SupportedModel = (typeof SUPPORTED_MODELS)[number];

// ── Client singleton ────────────────────────────────────────────────

function createClient(): OpenAI {
  return new OpenAI({
    apiKey: env.OPENAI_API_KEY,
    maxRetries: env.OPENAI_MAX_RETRIES,
    timeout: env.OPENAI_TIMEOUT_SECONDS * 1000,
  });
}

/** Lazily-initialized OpenAI client instance. */
let _client: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  _client ??= createClient();
  return _client;
}

// ── Model helpers ───────────────────────────────────────────────────

export function isModelSupported(model: string): model is SupportedModel {
  return (SUPPORTED_MODELS as readonly string[]).includes(model);
}

export function validateModel(model: string): SupportedModel {
  if (!isModelSupported(model)) {
    throw new Error(
      `Unsupported model "${model}". Supported: ${SUPPORTED_MODELS.join(', ')}`,
    );
  }
  return model;
}

/** Select model based on prompt complexity heuristic. */
export function selectModel(prompt: string, hasImage: boolean): SupportedModel {
  if (hasImage) return 'gpt-4o';

  const complexKeywords = ['flowchart', 'diagram', 'layout', 'architecture', 'complex', 'organize'];
  const isComplex = complexKeywords.some((k) => prompt.toLowerCase().includes(k));
  if (isComplex) return env.OPENAI_REASONING_MODEL as SupportedModel;

  const len = prompt.length;
  if (len < 80) return 'gpt-4o-mini';

  return env.OPENAI_MODEL as SupportedModel;
}

// ── Config accessors ────────────────────────────────────────────────

export const modelConfig = {
  get model() { return env.OPENAI_MODEL; },
  get fallbackModel() { return env.OPENAI_FALLBACK_MODEL; },
  get temperature() { return env.OPENAI_TEMPERATURE; },
  get maxTokens() { return env.OPENAI_MAX_TOKENS; },
  get topP() { return env.OPENAI_TOP_P; },
  get stream() { return env.OPENAI_STREAM; },
} as const;
