export type AppStatus = 'idle' | 'thinking' | 'streaming' | 'drawing';

const VALID_TRANSITIONS: Record<AppStatus, readonly AppStatus[]> = {
  idle: ['thinking'],
  thinking: ['streaming', 'drawing', 'idle'],
  streaming: ['drawing', 'idle'],
  drawing: ['drawing', 'idle'],
};

export function transitionStatus(current: AppStatus, next: AppStatus): AppStatus {
  if (current === next) return current;
  if (VALID_TRANSITIONS[current].includes(next)) return next;
  console.warn(`[statusMachine] Invalid transition: ${current} → ${next}`);
  return current;
}
