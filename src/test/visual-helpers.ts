export interface LayoutSnapshot {
  tag: string;
  testId?: string;
  role?: string;
  visible: boolean;
  bounds: { width: number; height: number; x: number; y: number };
  styles: Record<string, string>;
  children: LayoutSnapshot[];
}

export interface LayoutDiff {
  path: string;
  field: string;
  expected: unknown;
  actual: unknown;
}

function isVisible(el: HTMLElement): boolean {
  const style = window.getComputedStyle(el);
  if (style.display === 'none') return false;
  if (style.visibility === 'hidden') return false;
  if (style.opacity === '0') return false;
  return true;
}

export function captureLayout(
  container: HTMLElement,
  opts?: { maxDepth?: number; includeStyles?: string[] },
  _depth = 0,
): LayoutSnapshot {
  const maxDepth = opts?.maxDepth ?? Infinity;
  const includeStyles = opts?.includeStyles ?? [];

  const rect = container.getBoundingClientRect();
  const computedStyle = window.getComputedStyle(container);

  const styles: Record<string, string> = {};
  for (const prop of includeStyles) {
    styles[prop] = computedStyle.getPropertyValue(prop);
  }

  const children: LayoutSnapshot[] = [];
  if (_depth < maxDepth) {
    for (const child of Array.from(container.children)) {
      if (child instanceof HTMLElement) {
        children.push(captureLayout(child, opts, _depth + 1));
      }
    }
  }

  return {
    tag: container.tagName,
    testId: container.getAttribute('data-testid') ?? undefined,
    role: container.getAttribute('role') ?? undefined,
    visible: isVisible(container),
    bounds: {
      width: rect.width,
      height: rect.height,
      x: rect.x,
      y: rect.y,
    },
    styles,
    children,
  };
}

function diffSnapshotsRecursive(
  before: LayoutSnapshot,
  after: LayoutSnapshot,
  tolerance: { position?: number; size?: number },
  path: string,
  diffs: LayoutDiff[],
): void {
  const posTol = tolerance.position ?? 0;
  const sizeTol = tolerance.size ?? 0;

  if (before.tag !== after.tag) {
    diffs.push({ path, field: 'tag', expected: before.tag, actual: after.tag });
  }
  if (before.visible !== after.visible) {
    diffs.push({
      path,
      field: 'visible',
      expected: before.visible,
      actual: after.visible,
    });
  }

  // Check dimension changes
  if (Math.abs(before.bounds.width - after.bounds.width) > sizeTol) {
    diffs.push({
      path,
      field: 'bounds.width',
      expected: before.bounds.width,
      actual: after.bounds.width,
    });
  }
  if (Math.abs(before.bounds.height - after.bounds.height) > sizeTol) {
    diffs.push({
      path,
      field: 'bounds.height',
      expected: before.bounds.height,
      actual: after.bounds.height,
    });
  }
  if (Math.abs(before.bounds.x - after.bounds.x) > posTol) {
    diffs.push({
      path,
      field: 'bounds.x',
      expected: before.bounds.x,
      actual: after.bounds.x,
    });
  }
  if (Math.abs(before.bounds.y - after.bounds.y) > posTol) {
    diffs.push({
      path,
      field: 'bounds.y',
      expected: before.bounds.y,
      actual: after.bounds.y,
    });
  }

  // Check structural changes (children count)
  if (before.children.length !== after.children.length) {
    diffs.push({
      path,
      field: 'children.length',
      expected: before.children.length,
      actual: after.children.length,
    });
    return; // Can't compare children if counts differ
  }

  for (let i = 0; i < before.children.length; i++) {
    diffSnapshotsRecursive(
      before.children[i],
      after.children[i],
      tolerance,
      `${path} > ${after.children[i].tag}[${i}]`,
      diffs,
    );
  }
}

export function diffLayouts(
  before: LayoutSnapshot,
  after: LayoutSnapshot,
  tolerance?: { position?: number; size?: number },
): LayoutDiff[] {
  const diffs: LayoutDiff[] = [];
  diffSnapshotsRecursive(before, after, tolerance ?? {}, before.tag, diffs);
  return diffs;
}

export function expectDimensions(
  el: HTMLElement,
  expected: {
    minWidth?: number;
    maxWidth?: number;
    minHeight?: number;
    maxHeight?: number;
  },
): void {
  const rect = el.getBoundingClientRect();
  if (expected.minWidth !== undefined && rect.width < expected.minWidth) {
    throw new Error(
      `Element width ${rect.width} is less than minWidth ${expected.minWidth}`,
    );
  }
  if (expected.maxWidth !== undefined && rect.width > expected.maxWidth) {
    throw new Error(
      `Element width ${rect.width} exceeds maxWidth ${expected.maxWidth}`,
    );
  }
  if (expected.minHeight !== undefined && rect.height < expected.minHeight) {
    throw new Error(
      `Element height ${rect.height} is less than minHeight ${expected.minHeight}`,
    );
  }
  if (expected.maxHeight !== undefined && rect.height > expected.maxHeight) {
    throw new Error(
      `Element height ${rect.height} exceeds maxHeight ${expected.maxHeight}`,
    );
  }
}

export function expectVisible(
  container: HTMLElement,
  testId: string,
): void {
  const el = container.querySelector(`[data-testid="${testId}"]`);
  if (!el) {
    throw new Error(`Element with data-testid="${testId}" not found`);
  }
  if (!isVisible(el as HTMLElement)) {
    throw new Error(
      `Element with data-testid="${testId}" is not visible`,
    );
  }
}

export function expectHidden(
  container: HTMLElement,
  testId: string,
): void {
  const el = container.querySelector(`[data-testid="${testId}"]`);
  if (!el) {
    // Not found = effectively hidden
    return;
  }
  if (isVisible(el as HTMLElement)) {
    throw new Error(
      `Element with data-testid="${testId}" is visible but expected hidden`,
    );
  }
}
