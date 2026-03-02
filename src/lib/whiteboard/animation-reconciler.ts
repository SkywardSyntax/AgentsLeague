/**
 * Animation reconciler — tracks active animation sources per property.
 * JS animations claim priority; CSS transitions are deferred until JS releases.
 */

export type AnimationSource = 'js' | 'css';

export interface AnimationClaim {
  property: string;
  source: AnimationSource;
}

export interface AnimationReconciler {
  claimJS(property: string): void;
  releaseJS(property: string): void;
  canApplyCSS(property: string): boolean;
  activeAnimations(): AnimationClaim[];
  clear(): void;
}

export function createAnimationReconciler(): AnimationReconciler {
  const jsClaims = new Set<string>();

  function claimJS(property: string): void {
    jsClaims.add(property);
  }

  function releaseJS(property: string): void {
    jsClaims.delete(property);
  }

  function canApplyCSS(property: string): boolean {
    return !jsClaims.has(property);
  }

  function activeAnimations(): AnimationClaim[] {
    return Array.from(jsClaims).map((property) => ({
      property,
      source: 'js' as const,
    }));
  }

  function clear(): void {
    jsClaims.clear();
  }

  return { claimJS, releaseJS, canApplyCSS, activeAnimations, clear };
}
