'use client';

interface PropertyPanelProps {
  isVisible: boolean;
}

export default function PropertyPanel({ isVisible }: PropertyPanelProps) {
  if (!isVisible) return null;

  return (
    <aside
      className="fixed bottom-4 left-4 right-4 z-40 max-h-[calc(100vh-2rem)] overflow-y-auto rounded-xl border border-[hsl(var(--color-border-subtle))] bg-[hsl(var(--color-surface)/0.85)] p-4 shadow-lg backdrop-blur-xl sm:bottom-auto sm:left-auto sm:right-4 sm:top-4 sm:w-80"
      aria-label="Element properties"
      role="region"
    >
      {/* FillControl, StrokeControl, TypographyControl will go here */}
      <h3 className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--color-text-secondary))]">
        Properties
      </h3>
    </aside>
  );
}
