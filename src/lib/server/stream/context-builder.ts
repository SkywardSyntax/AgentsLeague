import type { StructuredWhiteboardContext, WhiteboardContext } from '@/types/agent';

export function clip(input: string, max: number): string {
  if (input.length <= max) return input;
  return `${input.slice(0, Math.max(0, max - 1))}…`;
}

export function buildWhiteboardContextMessage(context: WhiteboardContext): string {
  const counts = Object.entries(context.elementTypeCounts)
    .map(([type, count]) => `${type}:${count}`)
    .join(', ');
  const bounds = context.bounds
    ? `bounds=(${context.bounds.minX.toFixed(1)},${context.bounds.minY.toFixed(1)})..(${context.bounds.maxX.toFixed(1)},${context.bounds.maxY.toFixed(1)})`
    : 'bounds=none';

  const recent = context.recentElements
    .map((el) => `${el.type}:${el.id}${el.textPreview ? `="${el.textPreview.replace(/\s+/g, ' ').slice(0, 48)}"` : ''}`)
    .join(' | ');

  return [
    'WHITEBOARD CONTEXT (authoritative for this turn):',
    `- element_count=${context.elementCount}`,
    `- ${bounds}`,
    `- counts=${counts || 'none'}`,
    `- suggested_next_origin=(${context.suggestedNextOrigin.x.toFixed(1)}, ${context.suggestedNextOrigin.y.toFixed(1)})`,
    `- recent=${recent || 'none'}`,
    'Placement policy:',
    '- Default to placing new derivation steps at or below suggested_next_origin unless user explicitly asks to edit an existing region.',
    '- Keep each draw batch small and non-overlapping.',
  ].join('\n');
}

export function buildWhiteboardContextMessageV2(context: StructuredWhiteboardContext): string {
  const maxChars = context.token_budget_hint.max_chars;
  const bounds = context.scene_summary.bounds
    ? `bounds=(${context.scene_summary.bounds.minX.toFixed(1)},${context.scene_summary.bounds.minY.toFixed(1)})..(${context.scene_summary.bounds.maxX.toFixed(1)},${context.scene_summary.bounds.maxY.toFixed(1)})`
    : 'bounds=none';
  const counts = Object.entries(context.scene_summary.type_counts)
    .map(([type, count]) => `${type}:${count}`)
    .join(', ');

  const mathCtx = context.scene_summary.math_context ?? 'empty';
  const drawStyle = context.scene_summary.suggested_drawing_style ?? 'clean';

  const occupied = (context.occupied_regions ?? [])
    .slice(-10)
    .map((r) => `${r.id}@(${r.x.toFixed(0)},${r.y.toFixed(0)},${r.w.toFixed(0)}x${r.h.toFixed(0)})#${r.priority}`)
    .join(' | ');
  const anchors = (context.anchors ?? [])
    .slice(-12)
    .map((a) => `${a.role}:${a.id}@(${a.x.toFixed(0)},${a.y.toFixed(0)})`)
    .join(' | ');
  const recent = (context.recent_blocks ?? [])
    .slice(-10)
    .map((b) => `${b.kind}:${b.id}[${b.region}]${b.text_preview ? `="${b.text_preview}"` : ''}`)
    .join(' | ');
  const suggested = (context.suggested_next_regions ?? [])
    .map(
      (r) =>
        `${r.name}@(${r.x.toFixed(0)},${r.y.toFixed(0)},${r.w.toFixed(0)}x${r.h.toFixed(0)};score=${r.score.toFixed(2)})`,
    )
    .join(' | ');

  const message = [
    'WHITEBOARD CONTEXT V2 (authoritative):',
    `- scene.element_count=${context.scene_summary.element_count}`,
    `- ${bounds}`,
    `- scene.type_counts=${counts || 'none'}`,
    `- scene.math_context=${mathCtx}`,
    `- scene.drawing_style=${drawStyle}`,
    `- occupied_regions=${occupied || 'none'}`,
    `- anchors=${anchors || 'none'}`,
    `- recent_blocks=${recent || 'none'}`,
    `- suggested_next_regions=${suggested || 'none'}`,
    'Placement policy:',
    '- Prefer semantic templates and maintain strict visual legibility.',
    '- Default to highest-scored suggested_next_region unless user requests an explicit region rewrite.',
    '- Keep derivations top-to-bottom with clear block boundaries and no collisions.',
    'Drawing guidance:',
    `- math_context="${mathCtx}": ${mathCtx === 'empty' ? 'canvas is blank — place new content starting at suggested_next_regions.' : mathCtx === 'has_axes' ? 'axes exist — overlay curves or annotations on existing axes where appropriate.' : mathCtx === 'has_function' ? 'function curves present — add labels, tangent lines, or complementary plots nearby.' : 'geometric shapes present — maintain consistent scale and alignment.'}`,
    `- drawing_style="${drawStyle}": match existing aesthetic — ${drawStyle === 'formal' ? 'use precise coordinates, LaTeX labels, and clean lines.' : drawStyle === 'sketch' ? 'allow slight looseness and hand-drawn feel.' : 'use simple, uncluttered elements with uniform spacing.'}`,
    '- Check occupied_regions before placing new elements to avoid overlap.',
    '- Use anchors to align new elements with existing endpoints or shape centers.',
  ].join('\n');

  return clip(message, maxChars);
}
