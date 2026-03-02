import { describe, expect, it } from 'vitest';
import { parseGraphScriptToSemanticBatch } from '@/lib/whiteboard/graph-script';

describe('parseGraphScriptToSemanticBatch — snapshot', () => {
  it('locks down full output structure for a canonical multi-command script', () => {
    const script = [
      'set template=jacobian_mapping_2panel intent=derive style=blueprint_neat',
      'panel id=left region=left title="Domain" axes=u,v',
      'shape id=cell panel=left type=rect x=0.5 y=0.5 w=0.2 h=0.2 label="cell"',
      'panel id=right region=right title="Range" axes=x,y',
      'shape id=img panel=right type=parallelogram x=0.5 y=0.5 w=0.3 h=0.2 label="image"',
      'connect id=map type=maps_to from=left.cell.right to=right.img.left label="F"',
      'equation id=eq1 region=bottom tex="J = det(dF)"',
      'caption id=cap1 text="Area scales by |det J|"',
    ].join('\n');

    const result = parseGraphScriptToSemanticBatch({
      batch_id: 'snap-test-1',
      script,
    });

    expect(result.warnings).toEqual([]);
    expect(result.semanticBatch).not.toBeNull();

    const batch = result.semanticBatch!;

    expect(batch.template).toBe('jacobian_mapping_2panel');
    expect(batch.intent).toBe('derive');
    expect(batch.style_preset).toBe('blueprint_neat');

    // Snapshot the full blocks array
    expect(batch.blocks).toMatchInlineSnapshot(`
      [
        {
          "axes": {
            "x_label": "u",
            "y_label": "v",
          },
          "captions": [],
          "id": "left",
          "kind": "diagram_panel",
          "region_hint": "left",
          "shapes": [
            {
              "id": "cell",
              "label": "cell",
              "relative_pose": {
                "h": 0.2,
                "w": 0.2,
                "x": 0.5,
                "y": 0.5,
              },
              "type": "rect",
            },
          ],
          "title": "Domain",
        },
        {
          "axes": {
            "x_label": "x",
            "y_label": "y",
          },
          "captions": [],
          "id": "right",
          "kind": "diagram_panel",
          "region_hint": "right",
          "shapes": [
            {
              "id": "img",
              "label": "image",
              "relative_pose": {
                "h": 0.2,
                "w": 0.3,
                "x": 0.5,
                "y": 0.5,
              },
              "type": "parallelogram",
            },
          ],
          "title": "Range",
        },
        {
          "align": "left",
          "id": "eq-bottom",
          "kind": "equation_stack",
          "lines": [
            {
              "displayMode": true,
              "id": "eq1",
              "tex": "J = det(dF)",
            },
          ],
          "region_hint": "bottom",
        },
        {
          "id": "cap1",
          "kind": "caption",
          "region_hint": "auto",
          "text": "Area scales by |det J|",
        },
      ]
    `);

    // Snapshot the relations array
    expect(batch.relations).toMatchInlineSnapshot(`
      [
        {
          "from_anchor": "left-cell-right",
          "from_block_id": "left",
          "id": "map",
          "label": "F",
          "to_anchor": "right-img-left",
          "to_block_id": "right",
          "type": "maps_to",
        },
      ]
    `);
  });
});
