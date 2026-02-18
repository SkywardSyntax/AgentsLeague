export { renderElement, drawGhostRect } from './renderer';
export { WhiteboardRenderer } from './renderer/WhiteboardRenderer';
export { parseColor, applyBaseStyle, resetStyle, applyVendorPrefixes } from './renderer/StyleManager';
export { hitTest } from './hit-test';
export { createSpatialIndex, type SpatialIndex } from './spatial-index';
export {
  StreamingDrawController,
  SkeletonRenderer,
  easing,
} from './performance';
