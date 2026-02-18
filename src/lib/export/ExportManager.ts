import type { Camera, DrawElement } from '@/types';
import type { BoundingBox } from '@/types/drawing';

export interface ExportOptions {
  /** Scale factor (default: 1). */
  scale?: number;
  /** Include annotations layer (default: true). */
  includeAnnotations?: boolean;
  /** Background color (default: '#ffffff'). */
  backgroundColor?: string;
  /** Custom viewport to export (default: auto-fit all elements). */
  viewport?: BoundingBox;
  /** Padding in pixels around the content (default: 20). */
  padding?: number;
}

/** Compute bounding box enclosing all elements. */
function computeContentBounds(elements: DrawElement[]): BoundingBox {
  if (elements.length === 0) return { x: 0, y: 0, w: 100, h: 100 };

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of elements) {
    switch (el.type) {
      case 'rect':
      case 'text':
      case 'image':
        if (el.x < minX) minX = el.x;
        if (el.y < minY) minY = el.y;
        if (el.x + el.w > maxX) maxX = el.x + el.w;
        if (el.y + el.h > maxY) maxY = el.y + el.h;
        break;
      case 'ellipse':
        if (el.x - el.rx < minX) minX = el.x - el.rx;
        if (el.y - el.ry < minY) minY = el.y - el.ry;
        if (el.x + el.rx > maxX) maxX = el.x + el.rx;
        if (el.y + el.ry > maxY) maxY = el.y + el.ry;
        break;
      case 'line':
      case 'arrow':
      case 'freehand':
        for (const p of el.points) {
          if (p.x < minX) minX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.x > maxX) maxX = p.x;
          if (p.y > maxY) maxY = p.y;
        }
        break;
    }
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export class ExportManager {
  /**
   * Export to PNG using OffscreenCanvas.
   * Returns a Blob of the PNG image.
   */
  async exportPNG(
    elements: DrawElement[],
    renderFn: (ctx: OffscreenCanvasRenderingContext2D, camera: Camera) => void,
    options: ExportOptions = {},
  ): Promise<Blob> {
    const {
      scale = 1,
      backgroundColor = '#ffffff',
      padding = 20,
      viewport,
    } = options;

    const bounds = viewport ?? computeContentBounds(elements);
    const w = Math.ceil((bounds.w + padding * 2) * scale);
    const h = Math.ceil((bounds.h + padding * 2) * scale);

    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get OffscreenCanvas 2D context');

    // Fill background
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, w, h);

    // Set up camera to center content
    ctx.scale(scale, scale);
    ctx.translate(-bounds.x + padding, -bounds.y + padding);

    const camera: Camera = { x: -bounds.x + padding, y: -bounds.y + padding, zoom: scale };
    renderFn(ctx, camera);

    return canvas.convertToBlob({ type: 'image/png' });
  }

  /** Export to SVG string. */
  exportSVG(elements: DrawElement[], options: ExportOptions = {}): string {
    const { padding = 20, includeAnnotations = true, backgroundColor = '#ffffff' } = options;
    const bounds = options.viewport ?? computeContentBounds(elements);
    const w = bounds.w + padding * 2;
    const h = bounds.h + padding * 2;
    const ox = bounds.x - padding;
    const oy = bounds.y - padding;

    const parts: string[] = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${ox} ${oy} ${w} ${h}">`,
      `<rect x="${ox}" y="${oy}" width="${w}" height="${h}" fill="${backgroundColor}"/>`,
    ];

    for (const el of elements) {
      if (!includeAnnotations && el.groupId === '__annotations__') continue;
      parts.push(this.elementToSVG(el));
    }

    parts.push('</svg>');
    return parts.join('\n');
  }

  /** Export to PDF using pdf-lib. */
  async exportPDF(
    elements: DrawElement[],
    renderFn: (ctx: OffscreenCanvasRenderingContext2D, camera: Camera) => void,
    options: ExportOptions = {},
  ): Promise<Uint8Array> {
    const { PDFDocument } = await import('pdf-lib');

    // Render to PNG first, then embed in PDF
    const pngBlob = await this.exportPNG(elements, renderFn, options);
    const pngBytes = new Uint8Array(await pngBlob.arrayBuffer());

    const pdfDoc = await PDFDocument.create();
    const pngImage = await pdfDoc.embedPng(pngBytes);

    const page = pdfDoc.addPage([pngImage.width, pngImage.height]);
    page.drawImage(pngImage, {
      x: 0,
      y: 0,
      width: pngImage.width,
      height: pngImage.height,
    });

    return pdfDoc.save();
  }

  /** Convert a single DrawElement to SVG markup. */
  private elementToSVG(el: DrawElement): string {
    const opacity = el.opacity !== 1 ? ` opacity="${el.opacity}"` : '';
    const rotate = el.rotation ? ` transform="rotate(${el.rotation} ${el.x} ${el.y})"` : '';

    switch (el.type) {
      case 'rect':
        return `<rect x="${el.x}" y="${el.y}" width="${el.w}" height="${el.h}" rx="${el.cornerRadius}"${this.svgFill(el.fill)}${this.svgStroke(el.stroke)}${opacity}${rotate}/>`;

      case 'ellipse':
        return `<ellipse cx="${el.x}" cy="${el.y}" rx="${el.rx}" ry="${el.ry}"${this.svgFill(el.fill)}${this.svgStroke(el.stroke)}${opacity}${rotate}/>`;

      case 'line':
      case 'freehand':
        return `<polyline points="${el.points.map((p) => `${p.x},${p.y}`).join(' ')}" fill="none"${this.svgStroke(el.stroke)}${opacity}${rotate}/>`;

      case 'arrow': {
        const pts = el.points.map((p) => `${p.x},${p.y}`).join(' ');
        return `<polyline points="${pts}" fill="none"${this.svgStroke(el.stroke)}${opacity}${rotate} marker-end="url(#arrowhead)"/>`;
      }

      case 'text':
        return `<text x="${el.x}" y="${el.y + el.style.fontSize}" font-family="${el.style.fontFamily}" font-size="${el.style.fontSize}" fill="${el.style.color}"${opacity}${rotate}>${this.escapeXml(el.content)}</text>`;

      case 'image':
        return `<image x="${el.x}" y="${el.y}" width="${el.w}" height="${el.h}" href="${this.escapeXml(el.src)}"${opacity}${rotate}/>`;
    }
  }

  private svgFill(fill: { type: string; color: string; opacity: number }): string {
    if (fill.type === 'none') return ' fill="none"';
    return ` fill="${fill.color}" fill-opacity="${fill.opacity}"`;
  }

  private svgStroke(stroke: { color: string; width: number; dashArray?: number[] }): string {
    let s = ` stroke="${stroke.color}" stroke-width="${stroke.width}"`;
    if (stroke.dashArray && stroke.dashArray.length > 0) {
      s += ` stroke-dasharray="${stroke.dashArray.join(',')}"`;
    }
    return s;
  }

  private escapeXml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}
