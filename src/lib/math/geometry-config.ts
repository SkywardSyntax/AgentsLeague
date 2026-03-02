import { z } from 'zod';

export const AngleUnit = z.enum(['radians', 'degrees']);
export type AngleUnit = z.infer<typeof AngleUnit>;

export const GeometryConfigSchema = z.object({
  coordinateLimit: z.number().positive().max(1e6).default(1e5),
  precisionDigits: z.number().int().min(0).max(20).default(10),
  epsilon: z.number().min(1e-15).max(0.1).default(1e-10),
  maxVertices: z.number().int().min(3).max(100000).default(10000),
  angleUnit: AngleUnit.default('radians'),
});

export type GeometryConfig = z.infer<typeof GeometryConfigSchema>;

export function validateGeometryConfig(input: unknown): GeometryConfig {
  return GeometryConfigSchema.parse(input);
}
