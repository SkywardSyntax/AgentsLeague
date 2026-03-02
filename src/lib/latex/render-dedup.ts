/**
 * LaTeX render dedup — deduplicates in-flight renders for the same expression.
 * If a render for the same expression is already pending, returns the existing promise.
 */

export interface RenderDedup {
  render(
    tex: string,
    displayMode: boolean,
    renderFn: (tex: string, displayMode: boolean) => Promise<string>,
  ): Promise<string>;
  pendingCount(): number;
}

function cacheKey(tex: string, displayMode: boolean): string {
  return `${displayMode ? 'D' : 'I'}:${tex}`;
}

export function createRenderDedup(): RenderDedup {
  const pending = new Map<string, Promise<string>>();

  function render(
    tex: string,
    displayMode: boolean,
    renderFn: (tex: string, displayMode: boolean) => Promise<string>,
  ): Promise<string> {
    const key = cacheKey(tex, displayMode);
    const existing = pending.get(key);
    if (existing) return existing;

    const promise = renderFn(tex, displayMode).finally(() => {
      if (pending.get(key) === promise) {
        pending.delete(key);
      }
    });

    pending.set(key, promise);
    return promise;
  }

  return {
    render,
    pendingCount: () => pending.size,
  };
}
