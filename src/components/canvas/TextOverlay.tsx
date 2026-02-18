'use client';

export default function TextOverlay() {
  return (
    <div className="absolute inset-0 z-40 pointer-events-none" aria-hidden="true">
      {/* DOM-based text nodes will be positioned here using CSS transforms */}
    </div>
  );
}
