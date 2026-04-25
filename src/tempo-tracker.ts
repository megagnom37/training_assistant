import type { ExerciseDefinition } from './exercises/types';
import type { StateChangeEvent } from './state-machine';

export interface RepTempo {
  eccentric: number;
  pause: number;
  concentric: number;
  total: number;
}

export class TempoTracker {
  private exercise: ExerciseDefinition;
  private timestamps = new Map<string, number>();
  private repTempos: RepTempo[] = [];

  constructor(exercise: ExerciseDefinition) {
    this.exercise = exercise;
  }

  onStateChange(event: StateChangeEvent): void {
    this.timestamps.set(event.to, event.timestamp);
    this.tryRecordRep();
  }

  get lastTempo(): RepTempo | null {
    return this.repTempos.length > 0
      ? this.repTempos[this.repTempos.length - 1]
      : null;
  }

  get averageTempo(): RepTempo | null {
    if (this.repTempos.length === 0) return null;
    const sum = this.repTempos.reduce(
      (acc, t) => ({
        eccentric: acc.eccentric + t.eccentric,
        pause: acc.pause + t.pause,
        concentric: acc.concentric + t.concentric,
        total: acc.total + t.total,
      }),
      { eccentric: 0, pause: 0, concentric: 0, total: 0 }
    );
    const n = this.repTempos.length;
    return {
      eccentric: sum.eccentric / n,
      pause: sum.pause / n,
      concentric: sum.concentric / n,
      total: sum.total / n,
    };
  }

  reset(): void {
    this.timestamps.clear();
    this.repTempos = [];
  }

  private tryRecordRep(): void {
    const phases = this.exercise.tempoPhases;
    const allStatesNeeded = new Set<string>();
    for (const p of phases) {
      allStatesNeeded.add(p.from);
      allStatesNeeded.add(p.to);
    }

    for (const s of allStatesNeeded) {
      if (!this.timestamps.has(s)) return;
    }

    const result: Record<string, number> = {};
    let total = 0;
    for (const p of phases) {
      const from = this.timestamps.get(p.from)!;
      const to = this.timestamps.get(p.to)!;
      const dur = Math.max(0, (to - from) / 1000);
      result[p.name] = dur;
      total += dur;
    }

    const tempo: RepTempo = {
      eccentric: result['eccentric'] ?? 0,
      pause: result['pause'] ?? 0,
      concentric: result['concentric'] ?? 0,
      total,
    };

    if (tempo.total > 0.3 && tempo.total < 30) {
      this.repTempos.push(tempo);
    }

    this.timestamps.clear();
  }
}
