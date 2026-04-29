export type PaceStatus = 'on-pace' | 'behind' | 'idle';
export type ChallengeStatus = 'success' | 'failed' | 'cancelled';

export interface ChallengeState {
  remainingReps: number;
  remainingSeconds: number;
  targetTempo: number;
  currentTempo: number;
  paceStatus: PaceStatus;
  completed: boolean;
  succeeded: boolean;
}

export interface ChallengeResult {
  status: ChallengeStatus;
  targetReps: number;
  actualReps: number;
  targetTimeSeconds: number;
  elapsedSeconds: number;
  targetTempo: number;
  averageTempo: number;
}

export class ChallengeTracker {
  private targetReps: number;
  private targetTimeMs: number;
  private initialTargetTempo: number;

  private repTimestamps: number[] = [];
  private startTime = 0;
  private _done = false;
  private _succeeded = false;
  private _cancelled = false;
  private _endTime = 0;

  constructor(targetReps: number, targetTimeSeconds: number) {
    this.targetReps = targetReps;
    this.targetTimeMs = targetTimeSeconds * 1000;
    this.initialTargetTempo = targetReps / (targetTimeSeconds / 60);
  }

  start(): void {
    this.startTime = performance.now();
    this.repTimestamps = [];
    this._done = false;
    this._succeeded = false;
    this._cancelled = false;
    this._endTime = 0;
  }

  recordRep(): void {
    if (this._done) return;
    this.repTimestamps.push(performance.now());
    if (this.repTimestamps.length >= this.targetReps) {
      this._done = true;
      this._succeeded = true;
      this._endTime = performance.now();
    }
  }

  cancel(): void {
    if (this._done) return;
    this._done = true;
    this._cancelled = true;
    this._endTime = performance.now();
  }

  getState(): ChallengeState {
    const now = performance.now();
    const elapsed = now - this.startTime;
    const remainingMs = Math.max(0, this.targetTimeMs - elapsed);
    const remainingReps = Math.max(0, this.targetReps - this.repTimestamps.length);

    if (remainingMs <= 0 && !this._done) {
      this._done = true;
      this._succeeded = remainingReps <= 0;
      this._endTime = now;
    }

    const currentTempo = this.computeCurrentTempo(now);
    const dynamicTargetTempo = this.computeDynamicTargetTempo(remainingReps, remainingMs);
    const paceStatus = this.repTimestamps.length === 0
      ? 'idle' as PaceStatus
      : dynamicTargetTempo <= 0
        ? 'on-pace'
        : currentTempo >= dynamicTargetTempo * 0.9 ? 'on-pace' : 'behind';

    return {
      remainingReps,
      remainingSeconds: Math.ceil(remainingMs / 1000),
      targetTempo: Math.round(dynamicTargetTempo * 10) / 10,
      currentTempo: Math.round(currentTempo * 10) / 10,
      paceStatus,
      completed: this._done,
      succeeded: this._succeeded,
    };
  }

  getResult(): ChallengeResult {
    const endTime = this._endTime || performance.now();
    const elapsedMs = endTime - this.startTime;
    const elapsedSeconds = elapsedMs / 1000;
    const actualReps = this.repTimestamps.length;
    const averageTempo = elapsedSeconds > 0
      ? actualReps / (elapsedSeconds / 60)
      : 0;

    let status: ChallengeStatus;
    if (this._cancelled) {
      status = 'cancelled';
    } else if (this._succeeded) {
      status = 'success';
    } else {
      status = 'failed';
    }

    return {
      status,
      targetReps: this.targetReps,
      actualReps,
      targetTimeSeconds: this.targetTimeMs / 1000,
      elapsedSeconds: Math.round(elapsedSeconds * 10) / 10,
      targetTempo: Math.round(this.initialTargetTempo * 10) / 10,
      averageTempo: Math.round(averageTempo * 10) / 10,
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

  private computeDynamicTargetTempo(remainingReps: number, remainingMs: number): number {
    if (remainingReps <= 0) return 0;
    if (remainingMs <= 0) return 0;
    const remainingMinutes = remainingMs / 60_000;
    if (remainingMinutes <= 0) return 0;
    return remainingReps / remainingMinutes;
  }

  get done(): boolean {
    return this._done;
  }
}
