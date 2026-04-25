export type PaceStatus = 'on-pace' | 'behind' | 'idle';

export interface ChallengeState {
  remainingReps: number;
  remainingSeconds: number;
  targetTempo: number;
  currentTempo: number;
  paceStatus: PaceStatus;
  completed: boolean;
  succeeded: boolean;
}

export class ChallengeTracker {
  private targetReps: number;
  private targetTimeMs: number;
  private targetTempo: number;

  private repTimestamps: number[] = [];
  private startTime = 0;
  private _done = false;
  private _succeeded = false;

  constructor(targetReps: number, targetTimeSeconds: number) {
    this.targetReps = targetReps;
    this.targetTimeMs = targetTimeSeconds * 1000;
    this.targetTempo = targetReps / (targetTimeSeconds / 60);
  }

  start(): void {
    this.startTime = performance.now();
    this.repTimestamps = [];
    this._done = false;
    this._succeeded = false;
  }

  recordRep(): void {
    if (this._done) return;
    this.repTimestamps.push(performance.now());
    if (this.repTimestamps.length >= this.targetReps) {
      this._done = true;
      this._succeeded = true;
    }
  }

  getState(): ChallengeState {
    const now = performance.now();
    const elapsed = now - this.startTime;
    const remainingMs = Math.max(0, this.targetTimeMs - elapsed);
    const remainingReps = Math.max(0, this.targetReps - this.repTimestamps.length);

    if (remainingMs <= 0 && !this._done) {
      this._done = true;
      this._succeeded = remainingReps <= 0;
    }

    const currentTempo = this.computeCurrentTempo(now);
    const paceStatus = this.repTimestamps.length === 0
      ? 'idle' as PaceStatus
      : currentTempo >= this.targetTempo * 0.9 ? 'on-pace' : 'behind';

    return {
      remainingReps,
      remainingSeconds: Math.ceil(remainingMs / 1000),
      targetTempo: Math.round(this.targetTempo * 10) / 10,
      currentTempo: Math.round(currentTempo * 10) / 10,
      paceStatus,
      completed: this._done,
      succeeded: this._succeeded,
    };
  }

  private computeCurrentTempo(now: number): number {
    if (this.repTimestamps.length === 0) return 0;

    const windowMs = Math.min(60_000, now - this.startTime);
    if (windowMs <= 0) return 0;

    const windowStart = now - windowMs;
    let count = 0;
    for (let i = this.repTimestamps.length - 1; i >= 0; i--) {
      if (this.repTimestamps[i] >= windowStart) count++;
      else break;
    }

    return count * (60_000 / windowMs);
  }

  get done(): boolean {
    return this._done;
  }
}
