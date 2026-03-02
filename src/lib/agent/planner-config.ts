import { z } from 'zod';

export const PlannerStrategy = z.enum(['breadth-first', 'depth-first', 'iterative', 'adaptive']);
export type PlannerStrategy = z.infer<typeof PlannerStrategy>;

export const PlannerConfigSchema = z.object({
  maxSteps: z.number().int().min(1).max(1000).default(100),
  maxDepth: z.number().int().min(1).max(50).default(10),
  timeoutMs: z.number().min(100).max(300000).default(30000),
  strategy: PlannerStrategy.default('adaptive'),
  temperature: z.number().min(0).max(2).default(0.7),
  enableLogging: z.boolean().default(false),
});

export type PlannerConfig = z.infer<typeof PlannerConfigSchema>;

export function validatePlannerConfig(input: unknown): PlannerConfig {
  return PlannerConfigSchema.parse(input);
}
