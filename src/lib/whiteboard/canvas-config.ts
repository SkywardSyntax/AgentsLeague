import { z } from 'zod';

export const CanvasConfigSchema = z.object({
  dpr: z.number().min(1).max(5).default(1),
  width: z.number().positive().max(16384).default(800),
  height: z.number().positive().max(16384).default(600),
  zoomMin: z.number().min(0.01).max(100).default(0.1),
  zoomMax: z.number().min(0.01).max(100).default(10),
  backgroundColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Must be a 6-digit hex color (e.g. #ff00aa)')
    .default('#ffffff'),
}).refine((c) => c.zoomMin < c.zoomMax, {
  message: 'zoomMin must be less than zoomMax',
  path: ['zoomMin'],
});

export type CanvasConfig = z.infer<typeof CanvasConfigSchema>;

export function validateCanvasConfig(input: unknown): CanvasConfig {
  return CanvasConfigSchema.parse(input);
}
