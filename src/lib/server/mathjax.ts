import { prepareTexForMathJax } from '@/lib/latex/tex-normalize';

type MathJaxContext = {
  html: { convert: (tex: string, options: { display: boolean; em: number; ex: number }) => unknown };
  adaptor: { outerHTML: (node: unknown) => string };
};

let mathJaxContextPromise: Promise<MathJaxContext> | undefined;
const serverRenderCache = new Map<string, string>();
const MAX_SERVER_CACHE = 600;

export function isValidAdaptor(obj: unknown): obj is MathJaxContext['adaptor'] {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'outerHTML' in obj &&
    typeof (obj as Record<string, unknown>).outerHTML === 'function'
  );
}

export function isValidHtml(obj: unknown): obj is MathJaxContext['html'] {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'convert' in obj &&
    typeof (obj as Record<string, unknown>).convert === 'function'
  );
}

async function getMathJaxContext(): Promise<MathJaxContext> {
  if (!mathJaxContextPromise) {
    mathJaxContextPromise = (async () => {
      const [
        mathjaxMod,
        texMod,
        svgMod,
        liteAdaptorMod,
        registerHandlerMod,
        allPackagesMod,
      ] = await Promise.all([
        import('mathjax-full/js/mathjax.js'),
        import('mathjax-full/js/input/tex.js'),
        import('mathjax-full/js/output/svg.js'),
        import('mathjax-full/js/adaptors/liteAdaptor.js'),
        import('mathjax-full/js/handlers/html.js'),
        import('mathjax-full/js/input/tex/AllPackages.js'),
      ]);

      const adaptor = liteAdaptorMod.liteAdaptor();
      registerHandlerMod.RegisterHTMLHandler(adaptor);
      const tex = new texMod.TeX({ packages: allPackagesMod.AllPackages });
      const svg = new svgMod.SVG({ fontCache: 'none' });
      const html = mathjaxMod.mathjax.document('', { InputJax: tex, OutputJax: svg });

      if (!isValidAdaptor(adaptor)) {
        throw new Error('MathJax liteAdaptor() did not return a valid adaptor (missing outerHTML method)');
      }
      if (!isValidHtml(html)) {
        throw new Error('MathJax document() did not return a valid html object (missing convert method)');
      }

      return { html, adaptor };
    })();
  }

  return mathJaxContextPromise;
}

export async function renderTexToSvgServer(texInput: string, displayModeInput: boolean): Promise<string> {
  const prepared = prepareTexForMathJax(texInput, displayModeInput);
  const cacheKey = `${prepared.displayMode ? 'D' : 'I'}:${prepared.tex}`;

  const cached = serverRenderCache.get(cacheKey);
  if (cached) {
    serverRenderCache.delete(cacheKey);
    serverRenderCache.set(cacheKey, cached);
    return cached;
  }

  const ctx = await getMathJaxContext();
  const candidates = [prepared.tex];
  const rawTrimmed = texInput.trim();
  if (rawTrimmed.length > 0 && rawTrimmed !== prepared.tex) {
    candidates.push(rawTrimmed);
  }

  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      const node = ctx.html.convert(candidate, {
        display: prepared.displayMode,
        em: 16,
        ex: 8,
      });
      const svg = ctx.adaptor.outerHTML(node);
      if (serverRenderCache.size > MAX_SERVER_CACHE) {
        const oldest = serverRenderCache.keys().next().value as string | undefined;
        if (oldest) serverRenderCache.delete(oldest);
      }
      serverRenderCache.set(cacheKey, svg);
      return svg;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Server TeX render failed');
}

