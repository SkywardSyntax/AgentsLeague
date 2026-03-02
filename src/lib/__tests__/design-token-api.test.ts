import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { COORD_BOUNDS } from '@/lib/whiteboard/clamp-coordinates';
import { MIN_SCREEN_STROKE_PX, MAX_SCREEN_STROKE_PX } from '@/lib/whiteboard/geometry';
import { DEFAULT_PLANNER_CONFIG } from '@/lib/whiteboard/planner';
import { getInitialAppMode } from '@/lib/mode';
import type { AppMode } from '@/lib/mode';
import type { StylePreset } from '@/types/agent';

const globalsCss = readFileSync(
  resolve(__dirname, '../../app/globals.css'),
  'utf-8',
);

describe('Lane 08 — Design Token API', () => {
  it('all color tokens exist in globals.css', () => {
    const colorTokens = [
      '--color-app',
      '--color-paper',
      '--color-surface',
      '--color-surface-soft',
      '--color-panel',
      '--color-border',
      '--color-text-primary',
      '--color-text-secondary',
      '--color-text-muted',
      '--color-accent',
      '--color-accent-soft',
      '--color-accent-faint',
      '--color-warning-bg',
      '--color-warning-border',
      '--color-warning-text',
      '--color-danger',
    ];
    for (const token of colorTokens) {
      expect(globalsCss).toContain(token);
    }
    expect(colorTokens).toMatchInlineSnapshot(`
      [
        "--color-app",
        "--color-paper",
        "--color-surface",
        "--color-surface-soft",
        "--color-panel",
        "--color-border",
        "--color-text-primary",
        "--color-text-secondary",
        "--color-text-muted",
        "--color-accent",
        "--color-accent-soft",
        "--color-accent-faint",
        "--color-warning-bg",
        "--color-warning-border",
        "--color-warning-text",
        "--color-danger",
      ]
    `);
  });

  it('font tokens exist in globals.css', () => {
    expect(globalsCss).toContain('--font-display');
    expect(globalsCss).toContain('--font-body');
  });

  it('radius tokens exist in globals.css', () => {
    const radiusTokens = ['--radius-xl', '--radius-lg', '--radius-md'];
    for (const token of radiusTokens) {
      expect(globalsCss).toContain(token);
    }
  });

  it('shadow tokens exist in globals.css', () => {
    const shadowTokens = ['--shadow-soft', '--shadow-card'];
    for (const token of shadowTokens) {
      expect(globalsCss).toContain(token);
    }
  });

  it('COORD_BOUNDS constant shape and values are stable', () => {
    expect(COORD_BOUNDS).toMatchInlineSnapshot(`
      {
        "MAX_DIMENSION": 3000,
        "MAX_X": 4000,
        "MAX_Y": 4000,
        "MIN_DIMENSION": 1,
        "MIN_X": -2000,
        "MIN_Y": -2000,
      }
    `);
  });

  it('MIN_SCREEN_STROKE_PX constant is stable', () => {
    expect(MIN_SCREEN_STROKE_PX).toMatchInlineSnapshot(`1.25`);
  });

  it('MAX_SCREEN_STROKE_PX constant is stable', () => {
    expect(MAX_SCREEN_STROKE_PX).toMatchInlineSnapshot(`5.5`);
  });

  it('DEFAULT_PLANNER_CONFIG canvas dimensions are stable', () => {
    expect({
      canvasWidth: DEFAULT_PLANNER_CONFIG.canvasWidth,
      canvasHeight: DEFAULT_PLANNER_CONFIG.canvasHeight,
    }).toMatchInlineSnapshot(`
      {
        "canvasHeight": 1200,
        "canvasWidth": 1600,
      }
    `);
  });

  it('StylePreset union values are stable', () => {
    const presets: StylePreset[] = ['clean_pen_sketch', 'rough_sketch', 'blueprint_neat'];
    expect(presets).toMatchInlineSnapshot(`
      [
        "clean_pen_sketch",
        "rough_sketch",
        "blueprint_neat",
      ]
    `);
  });

  it('AppMode values are stable', () => {
    const modes: AppMode[] = ['interactive', 'agent'];
    expect(modes).toMatchInlineSnapshot(`
      [
        "interactive",
        "agent",
      ]
    `);
    expect(getInitialAppMode()).toBe('interactive');
  });
});
