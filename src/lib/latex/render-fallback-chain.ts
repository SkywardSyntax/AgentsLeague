/**
 * Fallback chain for TeX rendering resilience.
 * Tries renderers in order; if all fail, returns raw TeX in a <code> block.
 */

export interface LatexRenderer {
  name: string;
  render: (tex: string, display: boolean) => Promise<string>;
}

export interface FallbackChainOptions {
  onFallback?: (fromName: string, toName: string, error: Error) => void;
}

export interface LatexFallbackChain {
  renderWithFallback: (tex: string, display: boolean) => Promise<string>;
  lastUsedRenderer: () => string | null;
}

export function createLatexFallbackChain(
  renderers: LatexRenderer[],
  options: FallbackChainOptions = {},
): LatexFallbackChain {
  let lastUsed: string | null = null;

  async function renderWithFallback(
    tex: string,
    display: boolean,
  ): Promise<string> {
    for (let i = 0; i < renderers.length; i++) {
      const renderer = renderers[i];
      try {
        const result = await renderer.render(tex, display);
        if (!result) {
          const nextName =
            i + 1 < renderers.length ? renderers[i + 1].name : 'raw';
          const err = new Error('Renderer returned empty output');
          options.onFallback?.(renderer.name, nextName, err);
          continue;
        }
        lastUsed = renderer.name;
        return result;
      } catch (error) {
        const nextName =
          i + 1 < renderers.length ? renderers[i + 1].name : 'raw';
        options.onFallback?.(
          renderer.name,
          nextName,
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    }

    lastUsed = 'raw';
    return `<code>${tex}</code>`;
  }

  return {
    renderWithFallback,
    lastUsedRenderer: () => lastUsed,
  };
}
