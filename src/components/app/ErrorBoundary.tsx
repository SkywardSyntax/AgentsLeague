'use client';

import { Component, createRef, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  onRetry?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private primaryButtonRef = createRef<HTMLButtonElement>();

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary] Uncaught error:', error, info.componentStack);
  }

  componentDidMount(): void {
    if (this.state.hasError) {
      this.primaryButtonRef.current?.focus();
    }
  }

  componentDidUpdate(_prevProps: ErrorBoundaryProps, prevState: ErrorBoundaryState): void {
    if (this.state.hasError && !prevState.hasError) {
      this.primaryButtonRef.current?.focus();
    }
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
    this.props.onRetry?.();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="flex min-h-screen items-center justify-center bg-white p-4 font-sans text-gray-900 dark:bg-gray-950 dark:text-gray-100"
        >
          <div className="w-full max-w-[480px] text-center">
            <h1 className="mb-4 text-2xl">Something went wrong</h1>
            <p className="mb-6 text-gray-500 dark:text-gray-400">
              The application encountered an unexpected error. You can try reloading the page.
            </p>
            <details aria-label="Error details" className="mb-6 text-left">
              <summary className="cursor-pointer text-gray-500 dark:text-gray-400">Error details</summary>
              <pre
                role="log"
                className="mt-2 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-gray-100 p-3 text-[0.8rem] text-gray-900 dark:bg-gray-800 dark:text-gray-100"
              >
                {this.state.error?.message}
              </pre>
            </details>
            <div className="flex justify-center gap-3">
              {this.props.onRetry && (
                <button
                  ref={this.primaryButtonRef}
                  type="button"
                  onClick={this.handleRetry}
                  className="cursor-pointer rounded-lg border border-gray-300 bg-white px-6 py-2 text-sm text-gray-900 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
                >
                  Try Again
                </button>
              )}
              <button
                ref={this.props.onRetry ? undefined : this.primaryButtonRef}
                type="button"
                onClick={() => window.location.reload()}
                className="cursor-pointer rounded-lg border border-gray-300 bg-white px-6 py-2 text-sm text-gray-900 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
              >
                Reload
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
