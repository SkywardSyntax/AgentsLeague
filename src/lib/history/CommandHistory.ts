/** Command pattern interface for undo/redo. */
export interface Command {
  /** Unique type identifier for merge-coalescing. */
  readonly type: string;
  execute(): void;
  undo(): void;
  /** Optional: merge with a subsequent command of the same type (e.g. drag moves). */
  merge?(next: Command): Command | null;
}

const MAX_DEPTH = 200;

export class CommandHistory {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private batchActive = false;
  private batchCommands: Command[] = [];

  /** Execute and push a command, clearing the redo stack. */
  push(command: Command): void {
    command.execute();

    if (this.batchActive) {
      this.batchCommands.push(command);
      return;
    }

    this.addToUndoStack(command);
    this.redoStack = [];
  }

  private addToUndoStack(command: Command): void {
    // Merge-coalescing: try to merge with the last command
    if (this.undoStack.length > 0) {
      const last = this.undoStack[this.undoStack.length - 1]!;
      if (last.type === command.type && last.merge) {
        const merged = last.merge(command);
        if (merged) {
          this.undoStack[this.undoStack.length - 1] = merged;
          return;
        }
      }
    }

    this.undoStack.push(command);

    // Enforce max depth
    if (this.undoStack.length > MAX_DEPTH) {
      this.undoStack.shift();
    }
  }

  /** Undo the last command. */
  undo(): boolean {
    const command = this.undoStack.pop();
    if (!command) return false;
    command.undo();
    this.redoStack.push(command);
    return true;
  }

  /** Redo the last undone command. */
  redo(): boolean {
    const command = this.redoStack.pop();
    if (!command) return false;
    command.execute();
    this.undoStack.push(command);
    return true;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Start a batch: all pushed commands will be grouped into one undo step. */
  startBatch(): void {
    this.batchActive = true;
    this.batchCommands = [];
  }

  /** End the batch, merging all batched commands into a single composite command. */
  endBatch(): void {
    this.batchActive = false;
    if (this.batchCommands.length === 0) return;

    const commands = [...this.batchCommands];
    this.batchCommands = [];

    const composite: Command = {
      type: 'batch',
      execute() {
        for (const cmd of commands) cmd.execute();
      },
      undo() {
        for (let i = commands.length - 1; i >= 0; i--) commands[i]!.undo();
      },
    };

    this.addToUndoStack(composite);
    this.redoStack = [];
  }

  /** Clear all history. */
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.batchCommands = [];
    this.batchActive = false;
  }

  get undoSize(): number {
    return this.undoStack.length;
  }

  get redoSize(): number {
    return this.redoStack.length;
  }
}

// ── Concrete command examples ──────────────────────────────

/** Move command with merge-coalescing for drag operations. */
export class MoveCommand implements Command {
  readonly type = 'move';

  constructor(
    private readonly elementId: string,
    private readonly dx: number,
    private readonly dy: number,
    private readonly applyMove: (id: string, dx: number, dy: number) => void,
  ) {}

  execute(): void {
    this.applyMove(this.elementId, this.dx, this.dy);
  }

  undo(): void {
    this.applyMove(this.elementId, -this.dx, -this.dy);
  }

  merge(next: Command): Command | null {
    if (!(next instanceof MoveCommand)) return null;
    if (next.elementId !== this.elementId) return null;
    return new MoveCommand(
      this.elementId,
      this.dx + next.dx,
      this.dy + next.dy,
      this.applyMove,
    );
  }
}

/** Generic property change command. */
export class PropertyChangeCommand<T> implements Command {
  readonly type = 'property-change';

  constructor(
    private readonly elementId: string,
    private readonly property: string,
    private readonly oldValue: T,
    private readonly newValue: T,
    private readonly applyChange: (id: string, prop: string, value: T) => void,
  ) {}

  execute(): void {
    this.applyChange(this.elementId, this.property, this.newValue);
  }

  undo(): void {
    this.applyChange(this.elementId, this.property, this.oldValue);
  }
}
