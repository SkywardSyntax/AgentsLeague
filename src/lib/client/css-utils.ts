/**
 * CSS utility classes — typed utility class generator with Tailwind compatibility.
 */

type Falsy = false | null | undefined | 0 | '';
type ClassValue = string | Falsy | Record<string, boolean | Falsy> | ClassValue[];

export function cx(...inputs: ClassValue[]): string {
  const classes: string[] = [];

  for (const input of inputs) {
    if (!input) continue;

    if (typeof input === 'string') {
      classes.push(input);
    } else if (Array.isArray(input)) {
      const nested = cx(...input);
      if (nested) classes.push(nested);
    } else if (typeof input === 'object') {
      for (const [key, value] of Object.entries(input)) {
        if (value) classes.push(key);
      }
    }
  }

  // Deduplicate
  return [...new Set(classes)].join(' ');
}

const VALID_SPACING_SCALE = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 72, 80, 96] as const;

export function spacing(property: 'p' | 'm' | 'px' | 'py' | 'mx' | 'my' | 'pt' | 'pb' | 'pl' | 'pr' | 'mt' | 'mb' | 'ml' | 'mr', value: number): string {
  const clamped = VALID_SPACING_SCALE.reduce((prev, curr) =>
    Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev,
  );
  const formatted = Number.isInteger(clamped) ? String(clamped) : String(clamped).replace('.', '.'); 
  return `${property}-${formatted}`;
}

export function colorClass(prefix: 'text' | 'bg' | 'border', color: string, opacity?: number): string {
  const base = `${prefix}-${color}`;
  if (opacity !== undefined) {
    const clamped = Math.min(100, Math.max(0, Math.round(opacity / 5) * 5));
    return `${base}/${clamped}`;
  }
  return base;
}

export function responsiveClass(breakpoint: 'sm' | 'md' | 'lg' | 'xl' | '2xl', className: string): string {
  return `${breakpoint}:${className}`;
}
