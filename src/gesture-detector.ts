import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

const NOSE = 0;
const LEFT_WRIST = 15;
const RIGHT_WRIST = 16;

export class GestureDetector {
  private holdTimeMs: number;
  private raisedSince: number | null = null;
  private _progress = 0;
  private _triggered = false;

  constructor(holdTimeMs = 1500) {
    this.holdTimeMs = holdTimeMs;
  }

  update(landmarks: NormalizedLandmark[], timestamp: number): boolean {
    this._triggered = false;
    const handRaised = this.isHandAboveHead(landmarks);

    if (handRaised) {
      if (this.raisedSince === null) {
        this.raisedSince = timestamp;
      }
      const elapsed = timestamp - this.raisedSince;
      this._progress = Math.min(1, elapsed / this.holdTimeMs);

      if (elapsed >= this.holdTimeMs) {
        this._triggered = true;
        this.raisedSince = null;
        this._progress = 0;
      }
    } else {
      this.raisedSince = null;
      this._progress = 0;
    }

    return this._triggered;
  }

  get progress(): number {
    return this._progress;
  }

  get triggered(): boolean {
    return this._triggered;
  }

  reset(): void {
    this.raisedSince = null;
    this._progress = 0;
    this._triggered = false;
  }

  private isHandAboveHead(landmarks: NormalizedLandmark[]): boolean {
    const nose = landmarks[NOSE];
    const lw = landmarks[LEFT_WRIST];
    const rw = landmarks[RIGHT_WRIST];

    if (!nose || !lw || !rw) return false;

    const leftUp =
      (lw.visibility ?? 0) > 0.5 && lw.y < nose.y - 0.05;
    const rightUp =
      (rw.visibility ?? 0) > 0.5 && rw.y < nose.y - 0.05;

    return leftUp && rightUp;
  }
}
