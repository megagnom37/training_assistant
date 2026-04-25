import type { ExerciseDefinition } from '../exercises/types';
import { EXERCISES } from '../exercises/registry';

export type WorkoutMode = 'free' | 'challenge';

export interface WorkoutConfig {
  exercise: ExerciseDefinition;
  mode: WorkoutMode;
  targetReps?: number;
  targetTimeSeconds?: number;
}

const EXERCISE_ICONS: Record<string, string> = {
  squat: '\u{1F9CE}',
  'push-up': '\u{1F4AA}',
};

export class StartScreen {
  private root: HTMLElement;
  private stepExercise: HTMLElement;
  private stepMode: HTMLElement;
  private stepChallenge: HTMLElement;
  private exerciseCards: HTMLElement;

  private inputReps: HTMLInputElement;
  private inputMin: HTMLInputElement;
  private inputSec: HTMLInputElement;

  private selectedExercise: ExerciseDefinition | null = null;
  private selectedMode: WorkoutMode | null = null;

  private resolveConfig: ((cfg: WorkoutConfig) => void) | null = null;

  constructor() {
    this.root = document.getElementById('start-screen')!;
    this.stepExercise = document.getElementById('step-exercise')!;
    this.stepMode = document.getElementById('step-mode')!;
    this.stepChallenge = document.getElementById('step-challenge')!;
    this.exerciseCards = document.getElementById('exercise-cards')!;
    this.inputReps = document.getElementById('input-reps') as HTMLInputElement;
    this.inputMin = document.getElementById('input-min') as HTMLInputElement;
    this.inputSec = document.getElementById('input-sec') as HTMLInputElement;

    this.buildExerciseCards();
    this.bindEvents();
  }

  show(): Promise<WorkoutConfig> {
    this.reset();
    this.root.classList.remove('hidden');
    return new Promise((resolve) => {
      this.resolveConfig = resolve;
    });
  }

  hide(): void {
    this.root.classList.add('hidden');
  }

  private reset(): void {
    this.selectedExercise = null;
    this.selectedMode = null;
    this.showStep('exercise');
    this.exerciseCards.querySelectorAll('.card').forEach((c) => c.classList.remove('selected'));
  }

  private buildExerciseCards(): void {
    for (const ex of EXERCISES) {
      const btn = document.createElement('button');
      btn.className = 'card';
      btn.dataset.exerciseId = ex.id;
      btn.innerHTML = `
        <span class="card-icon">${EXERCISE_ICONS[ex.id] ?? '\u{1F3CB}'}</span>
        <span class="card-label">${ex.name}</span>
      `;
      btn.addEventListener('click', () => this.onExercisePick(ex, btn));
      this.exerciseCards.appendChild(btn);
    }
  }

  private bindEvents(): void {
    this.stepMode.querySelectorAll<HTMLButtonElement>('.card[data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.selectedMode = btn.dataset.mode as WorkoutMode;
        if (this.selectedMode === 'free') {
          this.finish();
        } else {
          this.showStep('challenge');
        }
      });
    });

    document.getElementById('btn-go')!.addEventListener('click', () => this.finish());
    document.getElementById('btn-back-exercise')!.addEventListener('click', () => this.showStep('exercise'));
    document.getElementById('btn-back-mode')!.addEventListener('click', () => this.showStep('mode'));
  }

  private onExercisePick(ex: ExerciseDefinition, btn: HTMLButtonElement): void {
    this.selectedExercise = ex;
    this.exerciseCards.querySelectorAll('.card').forEach((c) => c.classList.remove('selected'));
    btn.classList.add('selected');
    setTimeout(() => this.showStep('mode'), 150);
  }

  private showStep(step: 'exercise' | 'mode' | 'challenge'): void {
    this.stepExercise.classList.toggle('hidden', step !== 'exercise');
    this.stepMode.classList.toggle('hidden', step !== 'mode');
    this.stepChallenge.classList.toggle('hidden', step !== 'challenge');
  }

  private finish(): void {
    if (!this.selectedExercise || !this.selectedMode) return;

    const config: WorkoutConfig = {
      exercise: this.selectedExercise,
      mode: this.selectedMode,
    };

    if (this.selectedMode === 'challenge') {
      const reps = Math.max(1, parseInt(this.inputReps.value, 10) || 20);
      const mins = Math.max(0, parseInt(this.inputMin.value, 10) || 0);
      const secs = Math.max(0, parseInt(this.inputSec.value, 10) || 0);
      const totalSeconds = mins * 60 + secs;
      if (totalSeconds < 10) return;
      config.targetReps = reps;
      config.targetTimeSeconds = totalSeconds;
    }

    this.hide();
    this.resolveConfig?.(config);
    this.resolveConfig = null;
  }
}
