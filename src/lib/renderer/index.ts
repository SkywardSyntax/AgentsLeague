export { WhiteboardRenderer } from './WhiteboardRenderer';
export { parseColor, applyBaseStyle, resetStyle, applyVendorPrefixes } from './StyleManager';
export {
  renderRect,
  renderEllipse,
  renderLine,
  renderArrow,
  renderFreehand,
  renderText,
  renderImage,
} from './shape-renderers';
export {
  renderHandwrittenText,
  createSeededRandom,
  hashText,
  getCharacterPositions,
  renderAccessibleOverlay,
  wrapText,
} from './shape-renderers/text';
export type { HandwrittenTextStyle } from './shape-renderers/text';
