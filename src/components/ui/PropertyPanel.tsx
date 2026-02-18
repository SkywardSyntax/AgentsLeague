'use client';

interface PropertyPanelProps {
  isVisible: boolean;
}

export default function PropertyPanel({ isVisible }: PropertyPanelProps) {
  if (!isVisible) return null;

  return (
    <aside className="fixed bottom-4 left-4 z-40 w-64 rounded-xl bg-[var(--color-surface)] p-4 shadow-lg">
      {/* FillControl, StrokeControl, TypographyControl will go here */}
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
        Properties
      </h3>
    </aside>
  );
}
