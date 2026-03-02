import { describe, it, expect } from 'vitest';
import { validateCanvasConfig, CanvasConfigSchema } from '@/lib/whiteboard/canvas-config';

describe('CanvasConfigSchema', () => {
  it('accepts a fully valid configuration', () => {
    const config = validateCanvasConfig({
      dpr: 2, width: 1920, height: 1080,
      zoomMin: 0.1, zoomMax: 10, backgroundColor: '#1a2b3c',
    });
    expect(config.dpr).toBe(2);
    expect(config.width).toBe(1920);
  });

  it('applies defaults when fields are omitted', () => {
    const config = validateCanvasConfig({});
    expect(config.dpr).toBe(1);
    expect(config.width).toBe(800);
    expect(config.height).toBe(600);
    expect(config.backgroundColor).toBe('#ffffff');
  });

  it('rejects DPR below 1', () => {
    expect(() => validateCanvasConfig({ dpr: 0.5 })).toThrow();
  });

  it('rejects DPR above 5', () => {
    expect(() => validateCanvasConfig({ dpr: 6 })).toThrow();
  });

  it('rejects negative dimensions', () => {
    expect(() => validateCanvasConfig({ width: -100 })).toThrow();
    expect(() => validateCanvasConfig({ height: -50 })).toThrow();
  });

  it('rejects oversized canvas dimensions', () => {
    expect(() => validateCanvasConfig({ width: 20000 })).toThrow();
    expect(() => validateCanvasConfig({ height: 20000 })).toThrow();
  });

  it('rejects zoomMin >= zoomMax', () => {
    expect(() => validateCanvasConfig({ zoomMin: 5, zoomMax: 5 })).toThrow();
    expect(() => validateCanvasConfig({ zoomMin: 10, zoomMax: 2 })).toThrow();
  });

  it('rejects zoom values outside 0.01–100 range', () => {
    expect(() => validateCanvasConfig({ zoomMin: 0.001, zoomMax: 10 })).toThrow();
    expect(() => validateCanvasConfig({ zoomMin: 0.1, zoomMax: 200 })).toThrow();
  });

  it('rejects NaN and Infinity values', () => {
    expect(() => validateCanvasConfig({ dpr: NaN })).toThrow();
    expect(() => validateCanvasConfig({ width: Infinity })).toThrow();
  });

  it('rejects invalid background color formats', () => {
    expect(() => validateCanvasConfig({ backgroundColor: 'red' })).toThrow();
    expect(() => validateCanvasConfig({ backgroundColor: '#fff' })).toThrow();
    expect(() => validateCanvasConfig({ backgroundColor: '#gggggg' })).toThrow();
  });
});
