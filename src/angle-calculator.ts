import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { ExerciseDefinition } from './exercises/types';
import { calculateAngle } from './utils/math';
import { OneEuroFilter } from './utils/one-euro-filter';

const SYMMETRY_THRESHOLD = 35;

export class AngleCalculator {
  private filters = new Map<string, OneEuroFilter>();
  private exercise: ExerciseDefinition;

  constructor(exercise: ExerciseDefinition) {
    this.exercise = exercise;
    for (const angle of exercise.angles) {
      this.filters.set(angle.id, new OneEuroFilter(1.0, 0.007));
    }
  }

  compute(
    landmarks: NormalizedLandmark[],
    timestamp: number
  ): Map<string, number> | null {
    if (!this.checkVisibility(landmarks)) return null;

    const result = new Map<string, number>();
    const t = timestamp / 1000;

    for (let i = 0; i < this.exercise.angles.length; i++) {
      const def = this.exercise.angles[i];
      const pair = this.exercise.bilateralPairs[i];

      const leftAngle = this.computeTriple(landmarks, pair.left);
      const rightAngle = this.computeTriple(landmarks, pair.right);
      const symmetric = Math.abs(leftAngle - rightAngle) < SYMMETRY_THRESHOLD;
      const value = symmetric
        ? (leftAngle + rightAngle) / 2
        : Math.max(leftAngle, rightAngle);

      const filter = this.filters.get(def.id)!;
      result.set(def.id, filter.filter(t, value));
    }

    return result;
  }

  reset(): void {
    for (const f of this.filters.values()) {
      f.reset();
    }
  }

  private computeTriple(
    landmarks: NormalizedLandmark[],
    indices: [number, number, number]
  ): number {
    const [ai, bi, ci] = indices;
    return calculateAngle(landmarks[ai], landmarks[bi], landmarks[ci]);
  }

  private checkVisibility(landmarks: NormalizedLandmark[]): boolean {
    const indices = new Set<number>();
    for (const pair of this.exercise.bilateralPairs) {
      for (const idx of pair.left) indices.add(idx);
      for (const idx of pair.right) indices.add(idx);
    }
    for (const idx of indices) {
      if ((landmarks[idx]?.visibility ?? 0) < this.exercise.minVisibility) {
        return false;
      }
    }
    return true;
  }
}
