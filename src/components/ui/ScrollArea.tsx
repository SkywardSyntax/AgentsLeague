import type { ReactNode, HTMLAttributes } from 'react';

interface ScrollAreaProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function ScrollArea({ children, className, ...props }: ScrollAreaProps) {
  return (
    <div
      className={`overflow-auto [scrollbar-width:thin] [scrollbar-color:var(--color-border)_transparent] ${className ?? ''}`}
      {...props}
    >
      {children}
    </div>
  );
}
