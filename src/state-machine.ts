import type { ExerciseDefinition, StateTransition } from './exercises/types';

export interface StateChangeEvent {
  from: string;
  to: string;
  timestamp: number;
}

export type StateChangeCallback = (event: StateChangeEvent) => void;

export class ExerciseStateMachine {
  private state: string;
  private exercise: ExerciseDefinition;
  private repCount = 0;
  private pendingState: string | null = null;
  private pendingFrames = 0;
  private listeners: StateChangeCallback[] = [];

  constructor(exercise: ExerciseDefinition) {
    this.exercise = exercise;
    this.state = exercise.initialState;
  }

  update(angles: Map<string, number>, timestamp: number): void {
    const candidates = this.exercise.transitions.filter(
      (t) => t.from === this.state
    );

    let matched: StateTransition | undefined;
    for (const t of candidates) {
      const val = angles.get(t.condition.angleId);
      if (val === undefined) continue;
      if (this.evalCondition(val, t.condition.operator, t.condition.value)) {
        matched = t;
        break;
      }
    }

    if (matched) {
      if (this.pendingState === matched.to) {
        this.pendingFrames++;
      } else {
        this.pendingState = matched.to;
        this.pendingFrames = 1;
      }

      if (this.pendingFrames >= this.exercise.stabilityFrames) {
        const prev = this.state;
        this.state = matched.to;
        this.pendingState = null;
        this.pendingFrames = 0;

        const event: StateChangeEvent = { from: prev, to: this.state, timestamp };
        this.emit(event);

        if (
          this.exercise.incrementOn.from === prev &&
          this.exercise.incrementOn.to === this.state
        ) {
          this.repCount++;
        }
      }
    } else {
      this.pendingState = null;
      this.pendingFrames = 0;
    }
  }

  get count(): number {
    return this.repCount;
  }

  get currentState(): string {
    return this.state;
  }

  onChange(cb: StateChangeCallback): void {
    this.listeners.push(cb);
  }

  reset(): void {
    this.state = this.exercise.initialState;
    this.repCount = 0;
    this.pendingState = null;
    this.pendingFrames = 0;
  }

  private evalCondition(val: number, op: string, threshold: number): boolean {
    switch (op) {
      case '>':  return val > threshold;
      case '<':  return val < threshold;
      case '>=': return val >= threshold;
      case '<=': return val <= threshold;
      default:   return false;
    }
  }

  private emit(event: StateChangeEvent): void {
    for (const cb of this.listeners) {
      cb(event);
    }
  }
}
