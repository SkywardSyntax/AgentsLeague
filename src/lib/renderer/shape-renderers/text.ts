import type { TextElement } from '@/types/drawing';

export function renderText(
  ctx: CanvasRenderingContext2D,
  el: TextElement,
): void {
  const { x, y, w, content, style } = el;

  const font = `${style.fontWeight} ${style.fontSize}px ${style.fontFamily}`;
  ctx.font = font;
  ctx.fillStyle = style.color;
  ctx.textAlign = style.align;
  ctx.textBaseline = 'top';

  const lineHeight = style.lineHeight * style.fontSize;
  const lines = wrapText(ctx, content, w);

  let yOffset = y;
  for (const line of lines) {
    let xPos = x;
    if (style.align === 'center') {
      xPos = x + w / 2;
    } else if (style.align === 'right') {
      xPos = x + w;
    }
    ctx.fillText(line, xPos, yOffset);
    yOffset += lineHeight;
  }
}

/** Word-wrap text to fit within maxWidth. */
export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const paragraphs = text.split('\n');
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    const words = paragraph.split(' ');
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const metrics = ctx.measureText(testLine);

      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    lines.push(currentLine);
  }

  return lines;
}
