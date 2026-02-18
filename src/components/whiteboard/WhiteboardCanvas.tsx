'use client';

export default function WhiteboardCanvas() {
  return (
    <div className="relative h-full w-full overflow-hidden bg-[var(--color-canvas-bg)]">
      {/* Canvas layers will be stacked here via absolute positioning */}
      <div className="absolute inset-0">
        {/* BackgroundLayer — z-0 */}
        {/* ContentLayer — z-10 */}
        {/* ActiveDrawLayer — z-20 */}
        {/* CursorLayer — z-30 */}
      </div>
      {/* TextOverlay — DOM-based text nodes positioned over canvas */}
    </div>
  );
}
