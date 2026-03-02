/**
 * Strips dangerous elements and attributes from SVG markup to prevent XSS.
 * Designed for defense-in-depth on MathJax SVG output.
 */
export function sanitizeSvg(raw: string): string {
  if (!raw) return '';

  return raw
    // Strip <script> tags and content
    .replace(/<script[\s>][\s\S]*?<\/script>/gi, '')
    // Strip <foreignObject> elements
    .replace(/<foreignObject[\s>][\s\S]*?<\/foreignObject>/gi, '')
    // Strip <iframe>, <embed>, <object>
    .replace(/<iframe[\s>][\s\S]*?<\/iframe>/gi, '')
    .replace(/<embed[\s>][\s\S]*?<\/embed>/gi, '')
    .replace(/<object[\s>][\s\S]*?<\/object>/gi, '')
    // Remove all on* event handler attributes
    .replace(/\s+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]*)/gi, '')
    // Neutralize javascript: protocol in href/xlink:href
    .replace(/javascript\s*:/gi, 'about:blank');
}
