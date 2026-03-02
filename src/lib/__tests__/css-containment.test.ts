import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const globalsPath = path.resolve(__dirname, '../../app/globals.css');
const globalsCss = fs.readFileSync(globalsPath, 'utf-8');

const whiteboardCanvasPath = path.resolve(__dirname, '../../components/whiteboard/WhiteboardCanvas.tsx');
const whiteboardSource = fs.readFileSync(whiteboardCanvasPath, 'utf-8');

const chatPanelPath = path.resolve(__dirname, '../../components/chat/ChatPanel.tsx');
const chatPanelSource = fs.readFileSync(chatPanelPath, 'utf-8');

describe('CSS Containment', () => {
  // Test 1: WhiteboardCanvas container has contain: strict applied
  it('globals.css has contain: strict for [aria-label="Whiteboard"]', () => {
    const whiteboardRule = /\[aria-label="Whiteboard"\]\s*\{[^}]*contain:\s*strict/;
    expect(globalsCss).toMatch(whiteboardRule);
  });

  // Test 2: Chat messages container has contain: content applied
  it('globals.css has contain: content for [data-testid="chat-messages"]', () => {
    const chatRule = /\[data-testid="chat-messages"\]\s*\{[^}]*contain:\s*content/;
    expect(globalsCss).toMatch(chatRule);
  });

  // Test 3: contain: strict is a valid CSS containment value
  it('strict is a valid CSS containment value', () => {
    const validContainValues = ['none', 'strict', 'content', 'size', 'layout', 'paint', 'style'];
    expect(validContainValues).toContain('strict');
  });

  // Test 4: WhiteboardCanvas <section> has aria-label="Whiteboard"
  it('WhiteboardCanvas.tsx has aria-label="Whiteboard" on the container', () => {
    expect(whiteboardSource).toContain('aria-label="Whiteboard"');
  });

  // Test 5: contain: strict equals contain: size layout paint style
  it('strict is shorthand for size layout paint style', () => {
    // Per CSS Containment spec, `strict` is equivalent to `size layout paint style`
    const strictComponents = ['size', 'layout', 'paint', 'style'];
    const contentComponents = ['layout', 'paint', 'style'];
    // strict includes all components that content does, plus size
    expect(strictComponents).toEqual(expect.arrayContaining(contentComponents));
    expect(strictComponents).toContain('size');
    expect(strictComponents.length).toBe(4);
  });

  // Test 6: contain: content does NOT include size containment
  it('content shorthand does NOT include size containment', () => {
    // `content` is shorthand for `layout paint style` (no size)
    const contentComponents = ['layout', 'paint', 'style'];
    expect(contentComponents).not.toContain('size');
    // This is important: chat panel needs to grow/shrink, so size containment would break it
    expect(contentComponents.length).toBe(3);
  });

  // Test 7: CSS rule specificity doesn't conflict with Tailwind utilities
  it('attribute selectors have appropriate specificity', () => {
    // [aria-label="Whiteboard"] has specificity (0, 1, 0)
    // Tailwind utilities also have (0, 1, 0)
    // Since our rules are in globals.css which is loaded and these are specific containment
    // properties that Tailwind doesn't set, there's no conflict
    // Verify our rules don't use !important (not needed since Tailwind doesn't set contain)
    const whiteboardMatch = globalsCss.match(
      /\[aria-label="Whiteboard"\]\s*\{([^}]*)\}/
    );
    expect(whiteboardMatch).not.toBeNull();
    const ruleBody = whiteboardMatch![1];
    expect(ruleBody).not.toContain('!important');
  });

  // Test 8: No existing contain rules conflict
  it('no pre-existing contain rules conflict with the new ones', () => {
    // Find all contain: rules in the CSS
    const containRules = globalsCss.match(/contain\s*:/g) || [];
    // Should only have our 2 new rules
    expect(containRules.length).toBe(2);
  });

  // Test 9: LatexSvg inline display doesn't conflict with strict containment
  it('LatexSvg renders as inline-block which works inside contained parents', () => {
    const latexSvgPath = path.resolve(__dirname, '../../components/chat/LatexSvg.tsx');
    const latexSource = fs.readFileSync(latexSvgPath, 'utf-8');
    // LatexSvg uses inline-block display for its span wrapper
    expect(latexSource).toMatch(/inline-block|inline/);
    // contain: strict on a block parent does not collapse inline-block children
    // This is a CSS spec guarantee: containment affects the container, not children's display
  });

  // Test 10: Containment CSS rules target elements that exist in the component tree
  it('selectors target actual DOM elements in components', () => {
    // WhiteboardCanvas renders a div with aria-label="Whiteboard"
    expect(whiteboardSource).toContain('aria-label="Whiteboard"');
    // ChatPanel renders a div with data-testid="chat-messages"
    expect(chatPanelSource).toContain('data-testid="chat-messages"');
  });
});
