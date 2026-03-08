import { describe, it, expect } from 'vitest';
import { AGENT_SYSTEM_PROMPT } from '@/lib/server/openai';

describe('AGENT_SYSTEM_PROMPT quality checks', () => {
  it('contains all 30 draw element type names', () => {
    const elementTypes = [
      'rect', 'ellipse', 'line', 'arrow', 'text', 'latex', 'clear',
      'cartesian_axes', 'number_line', 'vector_arrow', 'function_curve',
      'matrix_bracket', 'linear_transform', 'angle_arc', 'integral_region',
      'circle_with_radius', 'triangle_with_angles', 'parametric_curve',
      'polar_plot', 'histogram', 'normal_distribution',
      'tangent_line', 'riemann_sum',
      'slope_field', 'vector_field_2d', 'wireframe_3d',
      'sequence_plot', 'bezier_curve',
      'complex_plane', 'number_theory_grid',
    ];
    for (const t of elementTypes) {
      expect(AGENT_SYSTEM_PROMPT).toContain(t);
    }
  });

  it('mentions coordinate system guidance', () => {
    expect(AGENT_SYSTEM_PROMPT).toContain('CANVAS COORDINATE GUIDE');
    expect(AGENT_SYSTEM_PROMPT).toContain('1400');
    expect(AGENT_SYSTEM_PROMPT).toContain('700');
    expect(AGENT_SYSTEM_PROMPT).toContain('top-left');
    expect(AGENT_SYSTEM_PROMPT).toContain('Y is inverted');
  });

  it('has a NEVER DO THESE section with at least 6 mistakes', () => {
    expect(AGENT_SYSTEM_PROMPT).toContain('NEVER DO THESE');
    const mistakeMatches = AGENT_SYSTEM_PROMPT.match(/Mistake \d+/g);
    expect(mistakeMatches).not.toBeNull();
    expect(mistakeMatches!.length).toBeGreaterThanOrEqual(6);
  });

  it('has at least 10 drawing recipes or few-shot examples', () => {
    const recipeMatches = AGENT_SYSTEM_PROMPT.match(/Recipe \d+/g) ?? [];
    const exampleMatches = AGENT_SYSTEM_PROMPT.match(/Example \d+/g) ?? [];
    expect(recipeMatches.length + exampleMatches.length).toBeGreaterThanOrEqual(10);
  });

  it('mentions multi-diagram placement guidance', () => {
    expect(AGENT_SYSTEM_PROMPT).toMatch(/multi.diagram/i);
  });

  it('mentions colorTheme', () => {
    expect(AGENT_SYSTEM_PROMPT).toContain('colorTheme');
  });

  it('has a type selection decision table', () => {
    expect(AGENT_SYSTEM_PROMPT).toContain('Quick Type Selection');
    expect(AGENT_SYSTEM_PROMPT).toContain('Want to show');
    expect(AGENT_SYSTEM_PROMPT).toContain('Use these types');
  });

  it('is comprehensive — total length > 8000 characters', () => {
    expect(AGENT_SYSTEM_PROMPT.length).toBeGreaterThan(8000);
  });
});
