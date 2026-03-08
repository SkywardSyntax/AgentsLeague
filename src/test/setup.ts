import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Global matchMedia mock for jsdom (used by WhiteboardCanvas DPR detection, useIsMobile, etc.)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
