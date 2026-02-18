'use client';

interface PropertyPanelProps {
  isVisible: boolean;
}

export default function PropertyPanel({ isVisible }: PropertyPanelProps) {
  if (!isVisible) return null;

  return (
    <aside
      className="fixed bottom-2 left-2 right-2 z-40 rounded-xl bg-[var(--color-surface)] p-3 shadow-lg sm:bottom-4 sm:left-4 sm:right-auto sm:w-64 sm:p-4"
      aria-label="Element properties"
      role="region"
    >
      {/* FillControl, StrokeControl, TypographyControl will go here */}
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
        Properties
      </h3>
    </aside>
  );
}
