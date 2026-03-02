import type { ActiveStroke } from '@/types/agent';

export interface RenderBatcher {
  enqueue(stroke: ActiveStroke): void;
  flush(): ActiveStroke[];
  pending(): number;
}

export function createRenderBatcher(): RenderBatcher {
  let queue: ActiveStroke[] = [];

  return {
    enqueue(stroke: ActiveStroke): void {
      queue.push(stroke);
    },

    flush(): ActiveStroke[] {
      const batch = queue;
      queue = [];
      return batch;
    },

    pending(): number {
      return queue.length;
    },
  };
}
