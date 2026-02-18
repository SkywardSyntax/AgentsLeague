/**
 * FontManager — async font loader with fallback chain and caching.
 *
 * Loads Caveat (primary) and Virgil (fallback) handwriting fonts,
 * caches FontFace objects, and provides text measurement utilities.
 */

export interface FontConfig {
  family: string;
  weight: string;
  src: string;
}

const HANDWRITING_FONTS: readonly FontConfig[] = [
  { family: 'Caveat', weight: '400 700', src: '/fonts/Caveat-Variable.woff2' },
  { family: 'Virgil', weight: '400', src: '/fonts/Virgil.woff2' },
] as const;

/** Fallback chain: caveat → virgil → inter → sans-serif */
export const FONT_FALLBACK_CHAIN = "'Caveat', 'Virgil', 'Inter', sans-serif";

export interface TextMeasurement {
  width: number;
  height: number;
}

export class FontManager {
  private static instance: FontManager | null = null;

  private loadedFonts = new Map<string, FontFace>();
  private loadPromise: Promise<void> | null = null;
  private measureCanvas: OffscreenCanvas | null = null;
  private measureCtx: OffscreenCanvasRenderingContext2D | null = null;

  private constructor() {}

  static getInstance(): FontManager {
    if (!FontManager.instance) {
      FontManager.instance = new FontManager();
    }
    return FontManager.instance;
  }

  /** Reset singleton (for testing). */
  static resetInstance(): void {
    FontManager.instance = null;
  }

  /** Warm up fonts on app start. Idempotent — safe to call multiple times. */
  preload(): Promise<void> {
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = this.loadAllFonts();
    return this.loadPromise;
  }

  private async loadAllFonts(): Promise<void> {
    const results = await Promise.allSettled(
      HANDWRITING_FONTS.map((font) => this.loadFont(font)),
    );

    for (const result of results) {
      if (result.status === 'rejected') {
        console.warn('Font load failed, will use fallback:', result.reason);
      }
    }
  }

  private async loadFont(config: FontConfig): Promise<FontFace> {
    if (this.loadedFonts.has(config.family)) {
      return this.loadedFonts.get(config.family)!;
    }

    const face = new FontFace(config.family, `url(${config.src})`, {
      weight: config.weight,
      display: 'swap',
    });

    const loaded = await face.load();
    document.fonts.add(loaded);
    this.loadedFonts.set(config.family, loaded);
    return loaded;
  }

  /** Check if a specific font family has been loaded. */
  isFontLoaded(family: string): boolean {
    return this.loadedFonts.has(family);
  }

  /** Get the best available font family string for canvas use. */
  getActiveFontFamily(): string {
    if (this.loadedFonts.has('Caveat')) return FONT_FALLBACK_CHAIN;
    if (this.loadedFonts.has('Virgil')) return "'Virgil', 'Inter', sans-serif";
    return "'Inter', sans-serif";
  }

  /** Measure text dimensions at a given font size using an offscreen canvas. */
  measureText(text: string, fontSize: number): TextMeasurement {
    const ctx = this.getMeasureCtx();
    ctx.font = `${fontSize}px ${FONT_FALLBACK_CHAIN}`;
    const metrics = ctx.measureText(text);
    return {
      width: metrics.width,
      height:
        metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent ||
        fontSize,
    };
  }

  private getMeasureCtx(): OffscreenCanvasRenderingContext2D {
    if (!this.measureCtx) {
      this.measureCanvas = new OffscreenCanvas(1, 1);
      this.measureCtx = this.measureCanvas.getContext('2d')!;
    }
    return this.measureCtx;
  }

  /** Return a snapshot of all loaded font families. */
  getLoadedFamilies(): string[] {
    return [...this.loadedFonts.keys()];
  }
}

export default FontManager;
