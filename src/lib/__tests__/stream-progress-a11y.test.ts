import { describe, it, expect } from 'vitest';
import { StreamProgress } from '@/components/chat/StreamProgress';
import type { StreamPhase } from '@/components/chat/StreamProgress';

/**
 * Lightweight structural tests for StreamProgress ARIA attributes.
 * We call the component function directly and inspect the returned JSX tree
 * since this project does not use a DOM rendering library in unit tests.
 */

function getProps(element: React.ReactElement): Record<string, unknown> {
  return (element as unknown as { props: Record<string, unknown> }).props;
}

function getChildren(element: React.ReactElement): React.ReactElement[] {
  const props = getProps(element);
  const children = props.children;
  if (Array.isArray(children)) return children.filter(Boolean) as React.ReactElement[];
  if (children) return [children as React.ReactElement];
  return [];
}

describe('StreamProgress accessibility', () => {
  it('renders with role="status" on the root element', () => {
    const result = StreamProgress({ phase: 'thinking' });
    expect(result).not.toBeNull();
    const props = getProps(result!);
    expect(props.role).toBe('status');
  });

  it('has aria-live="polite" on the root element', () => {
    const result = StreamProgress({ phase: 'thinking' });
    const props = getProps(result!);
    expect(props['aria-live']).toBe('polite');
  });

  it('has aria-atomic="true" on the root element', () => {
    const result = StreamProgress({ phase: 'streaming_text' });
    const props = getProps(result!);
    expect(props['aria-atomic']).toBe('true');
  });

  it('returns null for complete phase', () => {
    const result = StreamProgress({ phase: 'complete' });
    expect(result).toBeNull();
  });

  it('renders reconnection badge with role="alert"', () => {
    const result = StreamProgress({ phase: 'connecting', retryAttempt: 2, maxRetries: 3 });
    expect(result).not.toBeNull();
    const children = getChildren(result!);
    const alertChild = children.find(
      (child) => getProps(child).role === 'alert',
    );
    expect(alertChild).toBeDefined();
  });

  it('does not render alert badge when not retrying', () => {
    const result = StreamProgress({ phase: 'thinking' });
    expect(result).not.toBeNull();
    const children = getChildren(result!);
    const alertChild = children.find(
      (child) => typeof child === 'object' && child !== null && getProps(child).role === 'alert',
    );
    expect(alertChild).toBeUndefined();
  });

  it('shows correct label for each non-complete phase', () => {
    const phases: StreamPhase[] = ['connecting', 'thinking', 'streaming_text', 'drawing'];
    const expectedLabels = ['Connecting…', 'Thinking…', 'Writing…', 'Drawing…'];

    for (let i = 0; i < phases.length; i++) {
      const result = StreamProgress({ phase: phases[i] });
      expect(result).not.toBeNull();
      const children = getChildren(result!);
      const labelSpan = children.find(
        (child) => typeof child === 'object' && child !== null && !getProps(child).role && !getProps(child)['aria-hidden'],
      );
      expect(labelSpan).toBeDefined();
      expect(getProps(labelSpan!).children).toBe(expectedLabels[i]);
    }
  });
});
