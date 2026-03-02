/**
 * Chat XSS sanitizer — comprehensive XSS prevention for all chat rendering paths.
 * Strips dangerous HTML constructs while preserving safe text content.
 */

const SCRIPT_TAG_RE = /<script[\s\S]*?<\/script>/gi;
const STYLE_TAG_RE = /<style[\s\S]*?<\/style>/gi;
const EVENT_HANDLER_RE = /\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const JAVASCRIPT_URI_RE = /javascript\s*:/gi;
const VBSCRIPT_URI_RE = /vbscript\s*:/gi;
const DATA_URI_RE = /data\s*:\s*(?!image\/(?:png|jpeg|gif|webp|svg\+xml);base64,)[^\s"'>]+/gi;
const SVG_SCRIPT_RE = /<svg[\s\S]*?<\/svg>/gi;
const IFRAME_RE = /<iframe[\s\S]*?(?:<\/iframe>|\/?>)/gi;
const OBJECT_RE = /<object[\s\S]*?(?:<\/object>|\/?>)/gi;
const EMBED_RE = /<embed[\s\S]*?(?:\/?>)/gi;
const BASE_TAG_RE = /<base[\s\S]*?(?:\/?>)/gi;
const META_REFRESH_RE = /<meta[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi;
const EXPRESSION_RE = /expression\s*\(/gi;
const URL_EXPRESSION_RE = /url\s*\(\s*["']?\s*javascript:/gi;
const IMPORT_RE = /@import\s/gi;
const BINDING_RE = /-moz-binding\s*:/gi;

const DANGEROUS_ATTRS = ['srcdoc', 'formaction', 'xlink:href', 'action', 'background'];

export interface XssSanitizeResult {
  clean: string;
  threats: string[];
}

export function sanitizeChatHtml(input: unknown): XssSanitizeResult {
  if (typeof input !== 'string') {
    return { clean: '', threats: ['non-string input'] };
  }

  const threats: string[] = [];
  let value = input;

  if (SCRIPT_TAG_RE.test(value)) {
    threats.push('script_tag');
    value = value.replace(SCRIPT_TAG_RE, '');
  }

  if (STYLE_TAG_RE.test(value)) {
    threats.push('style_tag');
    value = value.replace(STYLE_TAG_RE, '');
  }

  if (IFRAME_RE.test(value)) {
    threats.push('iframe');
    value = value.replace(IFRAME_RE, '');
  }

  if (OBJECT_RE.test(value)) {
    threats.push('object_tag');
    value = value.replace(OBJECT_RE, '');
  }

  if (EMBED_RE.test(value)) {
    threats.push('embed_tag');
    value = value.replace(EMBED_RE, '');
  }

  if (SVG_SCRIPT_RE.test(value)) {
    threats.push('svg_xss');
    value = value.replace(SVG_SCRIPT_RE, '');
  }

  if (BASE_TAG_RE.test(value)) {
    threats.push('base_tag');
    value = value.replace(BASE_TAG_RE, '');
  }

  if (META_REFRESH_RE.test(value)) {
    threats.push('meta_refresh');
    value = value.replace(META_REFRESH_RE, '');
  }

  if (EVENT_HANDLER_RE.test(value)) {
    threats.push('event_handler');
    value = value.replace(EVENT_HANDLER_RE, '');
  }

  if (JAVASCRIPT_URI_RE.test(value)) {
    threats.push('javascript_uri');
    value = value.replace(JAVASCRIPT_URI_RE, '');
  }

  if (VBSCRIPT_URI_RE.test(value)) {
    threats.push('vbscript_uri');
    value = value.replace(VBSCRIPT_URI_RE, '');
  }

  if (DATA_URI_RE.test(value)) {
    threats.push('data_uri');
    value = value.replace(DATA_URI_RE, '');
  }

  if (EXPRESSION_RE.test(value)) {
    threats.push('css_expression');
    value = value.replace(EXPRESSION_RE, '');
  }

  if (URL_EXPRESSION_RE.test(value)) {
    threats.push('css_url_js');
    value = value.replace(URL_EXPRESSION_RE, 'url(');
  }

  if (IMPORT_RE.test(value)) {
    threats.push('css_import');
    value = value.replace(IMPORT_RE, '');
  }

  if (BINDING_RE.test(value)) {
    threats.push('moz_binding');
    value = value.replace(BINDING_RE, '');
  }

  for (const attr of DANGEROUS_ATTRS) {
    const attrRe = new RegExp(`\\s+${attr}\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]+)`, 'gi');
    if (attrRe.test(value)) {
      threats.push(`dangerous_attr_${attr}`);
      value = value.replace(attrRe, '');
    }
  }

  return { clean: value, threats };
}

export function escapeHtmlEntities(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

export function isSafeUrl(url: string): boolean {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim().toLowerCase();
  if (trimmed.startsWith('javascript:')) return false;
  if (trimmed.startsWith('vbscript:')) return false;
  if (trimmed.startsWith('data:') && !trimmed.startsWith('data:image/')) return false;
  if (trimmed.includes('\n') || trimmed.includes('\r')) return false;
  return true;
}
