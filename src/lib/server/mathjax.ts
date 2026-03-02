import { prepareTexForMathJax } from '@/lib/latex/tex-normalize';

type MathJaxContext = {
  html: { convert: (tex: string, options: { display: boolean; em: number; ex: number }) => unknown };
  adaptor: { outerHTML: (node: unknown) => string };
};

let mathJaxContextPromise: Promise<MathJaxContext> | undefined;
const serverRenderCache = new Map<string, string>();
const MAX_SERVER_CACHE = 600;

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

      return {
        html: html as MathJaxContext['html'],
        adaptor: adaptor as unknown as MathJaxContext['adaptor'],
      };
    })();
  }

  return mathJaxContextPromise;
}

export async function renderTexToSvgServer(texInput: string, displayModeInput: boolean): Promise<string> {
  const prepared = prepareTexForMathJax(texInput, displayModeInput);
  const cacheKey = `${prepared.displayMode ? 'D' : 'I'}:${prepared.tex}`;

  const cached = serverRenderCache.get(cacheKey);
  if (cached) return cached;

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

