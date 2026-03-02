import { z } from 'zod';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

const HexColorSchema = z.string().regex(HEX_COLOR, 'Must be a 6-digit hex color (e.g. #ff00aa)');

export const ThemeConfigSchema = z.object({
  primaryColor: HexColorSchema.default('#3b82f6'),
  secondaryColor: HexColorSchema.default('#6366f1'),
  backgroundColor: HexColorSchema.default('#ffffff'),
  textColor: HexColorSchema.default('#111827'),
  errorColor: HexColorSchema.default('#ef4444'),
  fontSize: z.number().positive().max(128).default(16),
  borderRadius: z.number().min(0).max(100).default(8),
  spacingUnit: z.number().positive().max(64).default(4),
  darkMode: z.boolean().default(false),
});

export type ThemeConfig = z.infer<typeof ThemeConfigSchema>;

export function validateThemeConfig(input: unknown): ThemeConfig {
  return ThemeConfigSchema.parse(input);
}
