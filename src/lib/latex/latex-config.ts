import { z } from 'zod';

const BLOCKED_COMMANDS = [
  '\\input', '\\include', '\\write', '\\read', '\\openout',
  '\\openin', '\\closein', '\\closeout', '\\immediate',
  '\\catcode', '\\def', '\\csname', '\\endcsname',
] as const;

export const LatexOutputFormat = z.enum(['svg', 'chtml', 'mathml']);
export type LatexOutputFormat = z.infer<typeof LatexOutputFormat>;

export const LatexConfigSchema = z.object({
  allowedPackages: z.array(z.string().min(1)).default(['ams', 'base', 'boldsymbol']),
  maxExpressionLength: z.number().int().min(1).max(50000).default(10000),
  maxNestingDepth: z.number().int().min(1).max(100).default(20),
  blockedCommands: z.array(z.string()).default([...BLOCKED_COMMANDS]),
  outputFormat: LatexOutputFormat.default('svg'),
});

export type LatexConfig = z.infer<typeof LatexConfigSchema>;

export function validateLatexConfig(input: unknown): LatexConfig {
  return LatexConfigSchema.parse(input);
}

export function isCommandBlocked(command: string, config: LatexConfig): boolean {
  return config.blockedCommands.some(
    (blocked) => command === blocked || command.startsWith(blocked + '{'),
  );
}

export { BLOCKED_COMMANDS };
