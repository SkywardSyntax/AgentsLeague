import type {
  DrawBatch,
  DrawElement,
  SemanticBatch,
  SemanticBlock,
  SemanticEquationStackBlock,
  SemanticDiagramPanelBlock,
  SemanticDiagramShape,
  StylePreset,
} from '@/types/agent';
import { buildDrawElement } from './factories';

let _counter = 0;
function uid(prefix: string): string {
  return `${prefix}-${++_counter}`;
}

export class DrawBatchBuilder {
  private batch: Partial<DrawBatch> = {};

  withId(id: string): this {
    this.batch.batch_id = id;
    return this;
  }

  withElements(...els: DrawElement[]): this {
    this.batch.elements = els;
    return this;
  }

  withStyle(style: StylePreset): this {
    this.batch.style_preset = style;
    return this;
  }

  build(): DrawBatch {
    return {
      batch_id: this.batch.batch_id ?? uid('batch'),
      elements: this.batch.elements ?? [buildDrawElement()],
      style_preset: this.batch.style_preset,
    };
  }
}

export class SemanticBatchBuilder {
  private blocks: SemanticBlock[] = [];
  private batchId: string = uid('sbatch');
  private style?: StylePreset;

  withEquationStack(lines: string[]): this {
    const block: SemanticEquationStackBlock = {
      id: uid('eq'),
      kind: 'equation_stack',
      lines: lines.map((tex) => ({ id: uid('line'), tex })),
    };
    this.blocks.push(block);
    return this;
  }

  withDiagramPanel(shapeCount: number): this {
    const shapes: SemanticDiagramShape[] = Array.from(
      { length: shapeCount },
      (_, i) => ({
        id: uid('shape'),
        type: 'rect' as const,
        label: `Shape ${i + 1}`,
      }),
    );
    const block: SemanticDiagramPanelBlock = {
      id: uid('diag'),
      kind: 'diagram_panel',
      shapes,
    };
    this.blocks.push(block);
    return this;
  }

  build(): SemanticBatch {
    return {
      batch_id: this.batchId,
      template: 'equation_derivation_vertical',
      blocks:
        this.blocks.length > 0
          ? this.blocks
          : [
              {
                id: uid('block'),
                kind: 'equation_stack',
                lines: [{ id: uid('line'), tex: 'x' }],
              },
            ],
      style_preset: this.style,
    };
  }
}
