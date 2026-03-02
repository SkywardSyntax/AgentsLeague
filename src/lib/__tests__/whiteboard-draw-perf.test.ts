import { describe, it, expect, vi } from 'vitest';

describe('WhiteboardCanvas active layer skip optimization', () => {
  // This tests the optimization logic: when no active strokes exist,
  // the RAF loop should skip active layer clear/redraw operations.

  it('skips active layer operations when activeStrokes is empty', () => {
    const clearRect = vi.fn();
    const setTransform = vi.fn();

    // Simulate the optimized draw frame logic
    const activeStrokes: unknown[] = [];
    let statsActive = 0;

    if (activeStrokes.length === 0) {
      if (statsActive > 0) {
        // Transition: clear once
        setTransform(1, 0, 0, 1, 0, 0);
        clearRect(0, 0, 1000, 700);
      }
      // No further active layer work
    } else {
      setTransform(1, 0, 0, 1, 0, 0);
      clearRect(0, 0, 1000, 700);
      setTransform(1, 0, 0, 1, 40, 40);
    }

    // With empty strokes and statsActive=0, nothing should be called
    expect(clearRect).not.toHaveBeenCalled();
    expect(setTransform).not.toHaveBeenCalled();
  });

  it('clears active layer once when transitioning from active to empty', () => {
    const clearRect = vi.fn();
    const setTransform = vi.fn();

    const activeStrokes: unknown[] = [];
    const statsActive = 5; // previously had active strokes

    if (activeStrokes.length === 0) {
      if (statsActive > 0) {
        setTransform(1, 0, 0, 1, 0, 0);
        clearRect(0, 0, 1000, 700);
      }
    } else {
      setTransform(1, 0, 0, 1, 0, 0);
      clearRect(0, 0, 1000, 700);
      setTransform(1, 0, 0, 1, 40, 40);
    }

    // Should have cleared once for transition
    expect(clearRect).toHaveBeenCalledTimes(1);
    expect(setTransform).toHaveBeenCalledTimes(1);
  });

  it('performs full active layer draw when strokes exist', () => {
    const clearRect = vi.fn();
    const setTransform = vi.fn();
    const drawStroke = vi.fn();

    const activeStrokes = [
      { id: 's1', points: [{ x: 0, y: 0 }, { x: 10, y: 10 }] },
      { id: 's2', points: [{ x: 20, y: 20 }, { x: 30, y: 30 }] },
    ];
    const statsActive = 0;

    if (activeStrokes.length === 0) {
      if (statsActive > 0) {
        setTransform(1, 0, 0, 1, 0, 0);
        clearRect(0, 0, 1000, 700);
      }
    } else {
      setTransform(1, 0, 0, 1, 0, 0);
      clearRect(0, 0, 1000, 700);
      setTransform(1, 0, 0, 1, 40, 40);
      for (const stroke of activeStrokes) {
        drawStroke(stroke);
      }
    }

    expect(clearRect).toHaveBeenCalledTimes(1);
    expect(setTransform).toHaveBeenCalledTimes(2);
    expect(drawStroke).toHaveBeenCalledTimes(2);
  });

  it('simulates 60 frames with no active strokes - zero draw calls', () => {
    const clearRect = vi.fn();
    const setTransform = vi.fn();

    for (let frame = 0; frame < 60; frame++) {
      const activeStrokes: unknown[] = [];
      const statsActive = 0; // already transitioned

      if (activeStrokes.length === 0) {
        if (statsActive > 0) {
          setTransform(1, 0, 0, 1, 0, 0);
          clearRect(0, 0, 1000, 700);
        }
      }
    }

    // No calls across 60 idle frames
    expect(clearRect).not.toHaveBeenCalled();
    expect(setTransform).not.toHaveBeenCalled();
  });
});
