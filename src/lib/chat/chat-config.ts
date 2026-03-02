import { z } from 'zod';

export const ChatRole = z.enum(['user', 'assistant', 'system']);
export type ChatRole = z.infer<typeof ChatRole>;

export const ChatConfigSchema = z.object({
  maxMessageLength: z.number().int().min(1).max(100000).default(4000),
  maxThreads: z.number().int().min(1).max(1000).default(50),
  maxHistory: z.number().int().min(1).max(10000).default(200),
  typingIndicatorTimeoutMs: z.number().min(100).max(30000).default(3000),
  allowedRoles: z.array(ChatRole).min(1).default(['user', 'assistant']),
  enableMarkdown: z.boolean().default(true),
});

export type ChatConfig = z.infer<typeof ChatConfigSchema>;

export function validateChatConfig(input: unknown): ChatConfig {
  return ChatConfigSchema.parse(input);
}
