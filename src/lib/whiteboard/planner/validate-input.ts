import type { SemanticBatch, SemanticBlock, SemanticEquationStackBlock } from '@/types/agent';

const MAX_BLOCKS = 8;

export interface ValidationResult {
  valid: boolean;
  repaired: SemanticBatch;
  warnings: string[];
}

let batchIdCounter = 0;

function isWhitespaceOnly(s: string): boolean {
  return s.trim().length === 0;
}

export function validateSemanticBatchInput(batch: SemanticBatch): ValidationResult {
  const warnings: string[] = [];
  let valid = true;

  // 1. Ensure batch_id is non-empty
  let batchId = batch.batch_id;
  if (!batchId || batchId.trim().length === 0) {
    batchIdCounter += 1;
    batchId = `auto-batch-${Date.now()}-${batchIdCounter}`;
    warnings.push('Missing or empty batch_id; auto-generated.');
    valid = false;
  }

  // 2. Deep-clone blocks for mutation
  let blocks: SemanticBlock[] = batch.blocks.map((b) => ({ ...b }));

  // 3. Deduplicate block IDs
  const seenIds = new Map<string, number>();
  blocks = blocks.map((block) => {
    const origId = block.id;
    const count = seenIds.get(origId) ?? 0;
    seenIds.set(origId, count + 1);
    if (count > 0) {
      const newId = `${origId}-dup-${count}`;
      warnings.push(`Duplicate block id '${origId}' renamed to '${newId}'.`);
      valid = false;
      return { ...block, id: newId };
    }
    return block;
  });

  // 4. Strip blocks with whitespace-only text/tex content
  blocks = blocks.filter((block) => {
    if (block.kind === 'caption') {
      if (isWhitespaceOnly(block.text)) {
        warnings.push(`Caption block '${block.id}' removed: whitespace-only text.`);
        valid = false;
        return false;
      }
    }
    if (block.kind === 'equation_stack') {
      const eqBlock = block as SemanticEquationStackBlock;
      const validLines = eqBlock.lines.filter((line) => !isWhitespaceOnly(line.tex));
      if (validLines.length === 0) {
        warnings.push(`Equation stack '${block.id}' removed: all lines are whitespace-only.`);
        valid = false;
        return false;
      }
      if (validLines.length < eqBlock.lines.length) {
        warnings.push(`Equation stack '${block.id}': stripped ${eqBlock.lines.length - validLines.length} whitespace-only line(s).`);
        valid = false;
        (block as SemanticEquationStackBlock).lines = validLines;
      }
    }
    return true;
  });

  // 5. Truncate blocks beyond MAX_BLOCKS
  if (blocks.length > MAX_BLOCKS) {
    warnings.push(`Truncated from ${blocks.length} blocks to ${MAX_BLOCKS}.`);
    valid = false;
    blocks = blocks.slice(0, MAX_BLOCKS);
  }

  // 6. Filter relations
  const validBlockIds = new Set(blocks.map((b) => b.id));
  let relations = (batch.relations ?? []).filter((rel) => {
    if (rel.from_block_id === rel.to_block_id) {
      warnings.push(`Self-referencing relation '${rel.id ?? '(no id)'}' removed (from_block_id === to_block_id: '${rel.from_block_id}').`);
      valid = false;
      return false;
    }
    if (!validBlockIds.has(rel.from_block_id)) {
      warnings.push(`Relation '${rel.id ?? '(no id)'}' removed: from_block_id '${rel.from_block_id}' does not exist.`);
      valid = false;
      return false;
    }
    if (!validBlockIds.has(rel.to_block_id)) {
      warnings.push(`Relation '${rel.id ?? '(no id)'}' removed: to_block_id '${rel.to_block_id}' does not exist.`);
      valid = false;
      return false;
    }
    return true;
  });

  const repaired: SemanticBatch = {
    ...batch,
    batch_id: batchId,
    blocks,
    relations,
  };

  return { valid, repaired, warnings };
}
