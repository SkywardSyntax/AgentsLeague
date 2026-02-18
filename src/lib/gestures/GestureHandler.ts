import type { Point } from '@/types';

// ── Gesture types ─────────────────────────────────────────

export type GestureType = 'tap' | 'drag' | 'pinch' | 'three-finger-undo' | 'none';

export interface GestureEvent {
  type: GestureType;
  /** Current position (primary pointer). */
  position: Point;
  /** Delta from last event. */
  delta: Point;
  /** Pinch scale factor (1 = no change). */
  scale: number;
  /** Number of active pointers. */
  pointerCount: number;
  /** Whether this is the final event in a gesture sequence. */
  isFinal: boolean;
  /** Original DOM event. */
  originalEvent: PointerEvent | TouchEvent;
}

export type GestureCallback = (event: GestureEvent) => void;

// ── FSM states ────────────────────────────────────────────

type GestureState = 'idle' | 'pending' | 'dragging' | 'pinching' | 'three-finger';

interface PointerInfo {
  id: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

const TAP_THRESHOLD = 8; // px movement to distinguish tap from drag
const TAP_TIMEOUT = 300; // ms

export class GestureHandler {
  private state: GestureState = 'idle';
  private pointers = new Map<number, PointerInfo>();
  private tapTimer: ReturnType<typeof setTimeout> | null = null;
  private initialPinchDistance = 0;
  private lastScale = 1;

  private onTap: GestureCallback | null = null;
  private onDragStart: GestureCallback | null = null;
  private onDrag: GestureCallback | null = null;
  private onDragEnd: GestureCallback | null = null;
  private onPinch: GestureCallback | null = null;
  private onThreeFingerUndo: GestureCallback | null = null;

  private boundPointerDown = this.handlePointerDown.bind(this);
  private boundPointerMove = this.handlePointerMove.bind(this);
  private boundPointerUp = this.handlePointerUp.bind(this);
  private boundTouchStart = this.handleTouchStart.bind(this);

  /** Attach event listeners to an element. */
  attach(element: HTMLElement): void {
    element.addEventListener('pointerdown', this.boundPointerDown);
    element.addEventListener('pointermove', this.boundPointerMove);
    element.addEventListener('pointerup', this.boundPointerUp);
    element.addEventListener('pointercancel', this.boundPointerUp);
    element.addEventListener('touchstart', this.boundTouchStart, { passive: false });
    element.style.touchAction = 'none';
  }

  /** Detach event listeners. */
  detach(element: HTMLElement): void {
    element.removeEventListener('pointerdown', this.boundPointerDown);
    element.removeEventListener('pointermove', this.boundPointerMove);
    element.removeEventListener('pointerup', this.boundPointerUp);
    element.removeEventListener('pointercancel', this.boundPointerUp);
    element.removeEventListener('touchstart', this.boundTouchStart);
  }

  // ── Callback registration ──────────────────────────────

  on(event: 'tap', cb: GestureCallback): this;
  on(event: 'dragstart', cb: GestureCallback): this;
  on(event: 'drag', cb: GestureCallback): this;
  on(event: 'dragend', cb: GestureCallback): this;
  on(event: 'pinch', cb: GestureCallback): this;
  on(event: 'three-finger-undo', cb: GestureCallback): this;
  on(event: string, cb: GestureCallback): this {
    switch (event) {
      case 'tap': this.onTap = cb; break;
      case 'dragstart': this.onDragStart = cb; break;
      case 'drag': this.onDrag = cb; break;
      case 'dragend': this.onDragEnd = cb; break;
      case 'pinch': this.onPinch = cb; break;
      case 'three-finger-undo': this.onThreeFingerUndo = cb; break;
    }
    return this;
  }

  // ── FSM transition ─────────────────────────────────────

  private transition(newState: GestureState): void {
    this.state = newState;
  }

  // ── Pointer event handlers ─────────────────────────────

  private handleTouchStart(e: TouchEvent): void {
    // Prevent default to avoid browser gestures conflicting
    if (e.touches.length >= 2) e.preventDefault();
  }

  private handlePointerDown(e: PointerEvent): void {
    const info: PointerInfo = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY,
    };
    this.pointers.set(e.pointerId, info);

    const count = this.pointers.size;

    if (count === 1) {
      this.transition('pending');
      this.tapTimer = setTimeout(() => {
        this.tapTimer = null;
      }, TAP_TIMEOUT);
    } else if (count === 2) {
      this.transition('pinching');
      this.initialPinchDistance = this.getPinchDistance();
      this.lastScale = 1;
      if (this.tapTimer) {
        clearTimeout(this.tapTimer);
        this.tapTimer = null;
      }
    } else if (count >= 3) {
      this.transition('three-finger');
      if (this.tapTimer) {
        clearTimeout(this.tapTimer);
        this.tapTimer = null;
      }
    }
  }

  private handlePointerMove(e: PointerEvent): void {
    const info = this.pointers.get(e.pointerId);
    if (!info) return;

    const prevX = info.currentX;
    const prevY = info.currentY;
    info.currentX = e.clientX;
    info.currentY = e.clientY;

    switch (this.state) {
      case 'pending': {
        const dx = info.currentX - info.startX;
        const dy = info.currentY - info.startY;
        if (Math.sqrt(dx * dx + dy * dy) > TAP_THRESHOLD) {
          this.transition('dragging');
          this.emit(this.onDragStart, 'drag', e, info, prevX, prevY);
        }
        break;
      }
      case 'dragging':
        this.emit(this.onDrag, 'drag', e, info, prevX, prevY);
        break;
      case 'pinching': {
        const dist = this.getPinchDistance();
        if (this.initialPinchDistance > 0) {
          this.lastScale = dist / this.initialPinchDistance;
        }
        const center = this.getPinchCenter();
        this.onPinch?.({
          type: 'pinch',
          position: center,
          delta: { x: 0, y: 0 },
          scale: this.lastScale,
          pointerCount: this.pointers.size,
          isFinal: false,
          originalEvent: e,
        });
        break;
      }
    }
  }

  private handlePointerUp(e: PointerEvent): void {
    const info = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);

    if (!info) return;

    switch (this.state) {
      case 'pending':
        if (this.tapTimer) {
          clearTimeout(this.tapTimer);
          this.tapTimer = null;
        }
        this.onTap?.({
          type: 'tap',
          position: { x: info.startX, y: info.startY },
          delta: { x: 0, y: 0 },
          scale: 1,
          pointerCount: 1,
          isFinal: true,
          originalEvent: e,
        });
        this.transition('idle');
        break;

      case 'dragging':
        this.emit(this.onDragEnd, 'drag', e, info, info.currentX, info.currentY, true);
        this.transition('idle');
        break;

      case 'pinching':
        if (this.pointers.size < 2) {
          this.transition(this.pointers.size === 1 ? 'pending' : 'idle');
        }
        break;

      case 'three-finger':
        if (this.pointers.size === 0) {
          this.onThreeFingerUndo?.({
            type: 'three-finger-undo',
            position: { x: info.currentX, y: info.currentY },
            delta: { x: 0, y: 0 },
            scale: 1,
            pointerCount: 0,
            isFinal: true,
            originalEvent: e,
          });
          this.transition('idle');
        }
        break;
    }
  }

  // ── Helpers ────────────────────────────────────────────

  private emit(
    cb: GestureCallback | null,
    type: GestureType,
    e: PointerEvent,
    info: PointerInfo,
    prevX: number,
    prevY: number,
    isFinal = false,
  ): void {
    cb?.({
      type,
      position: { x: info.currentX, y: info.currentY },
      delta: { x: info.currentX - prevX, y: info.currentY - prevY },
      scale: 1,
      pointerCount: this.pointers.size,
      isFinal,
      originalEvent: e,
    });
  }

  private getPinchDistance(): number {
    const pts = Array.from(this.pointers.values());
    if (pts.length < 2) return 0;
    const a = pts[0]!;
    const b = pts[1]!;
    const dx = a.currentX - b.currentX;
    const dy = a.currentY - b.currentY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private getPinchCenter(): Point {
    const pts = Array.from(this.pointers.values());
    if (pts.length < 2) return { x: 0, y: 0 };
    const a = pts[0]!;
    const b = pts[1]!;
    return { x: (a.currentX + b.currentX) / 2, y: (a.currentY + b.currentY) / 2 };
  }

  /** Reset FSM to idle. */
  reset(): void {
    this.pointers.clear();
    if (this.tapTimer) {
      clearTimeout(this.tapTimer);
      this.tapTimer = null;
    }
    this.state = 'idle';
  }

  getState(): GestureState {
    return this.state;
  }
}
