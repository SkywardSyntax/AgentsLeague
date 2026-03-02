'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
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

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            padding: '1rem',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <div style={{ maxWidth: '480px', width: '100%', textAlign: 'center' }}>
            <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Something went wrong</h1>
            <p style={{ color: '#666', marginBottom: '1.5rem' }}>
              The application encountered an unexpected error. You can try reloading the page.
            </p>
            <details style={{ textAlign: 'left', marginBottom: '1.5rem' }}>
              <summary style={{ cursor: 'pointer', color: '#888' }}>Error details</summary>
              <pre
                style={{
                  marginTop: '0.5rem',
                  padding: '0.75rem',
                  background: '#f5f5f5',
                  borderRadius: '0.5rem',
                  fontSize: '0.8rem',
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {this.state.error?.message}
              </pre>
            </details>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                padding: '0.5rem 1.5rem',
                fontSize: '0.9rem',
                borderRadius: '0.5rem',
                border: '1px solid #ccc',
                background: '#fff',
                cursor: 'pointer',
              }}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
