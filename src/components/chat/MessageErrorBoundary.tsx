'use client';
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props { children: ReactNode; fallbackText: string; }
interface State { hasError: boolean; }

export class MessageErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.warn('[MessageErrorBoundary]', error.message, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <code className="rounded-md bg-[var(--color-surface-soft)] px-1 py-0.5 text-[var(--color-danger)]">
          {this.props.fallbackText}
        </code>
      );
    }
    return this.props.children;
  }
}
