/**
 * UUID generation utility with browser compatibility.
 * Uses crypto.randomUUID when available (modern browsers),
 * falls back to Math.random() based generation (Safari, older browsers).
 */

export function generateUUID(): string {
  // Check if crypto.randomUUID is available (modern browsers, Node.js 15+)
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  // Fallback for older browsers: Math.random-based UUID v4 generation
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
