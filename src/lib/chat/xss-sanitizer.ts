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

  // Avoid .test() + .replace() on the same /g regex — .test() advances lastIndex,
  // causing .replace() to miss matches. Instead, just .replace() and compare.
  const strip = (re: RegExp, threat: string, replacement = '') => {
    const cleaned = value.replace(re, replacement);
    if (cleaned !== value) {
      threats.push(threat);
      value = cleaned;
    }
  };

  strip(SCRIPT_TAG_RE, 'script_tag');
  strip(STYLE_TAG_RE, 'style_tag');
  strip(IFRAME_RE, 'iframe');
  strip(OBJECT_RE, 'object_tag');
  strip(EMBED_RE, 'embed_tag');
  strip(SVG_SCRIPT_RE, 'svg_xss');
  strip(BASE_TAG_RE, 'base_tag');
  strip(META_REFRESH_RE, 'meta_refresh');
  strip(EVENT_HANDLER_RE, 'event_handler');
  strip(JAVASCRIPT_URI_RE, 'javascript_uri');
  strip(VBSCRIPT_URI_RE, 'vbscript_uri');
  strip(DATA_URI_RE, 'data_uri');
  strip(EXPRESSION_RE, 'css_expression');
  strip(URL_EXPRESSION_RE, 'css_url_js', 'url(');
  strip(IMPORT_RE, 'css_import');
  strip(BINDING_RE, 'moz_binding');

  for (const attr of DANGEROUS_ATTRS) {
    const attrRe = new RegExp(`\\s+${attr}\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]+)`, 'gi');
    strip(attrRe, `dangerous_attr_${attr}`);
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
