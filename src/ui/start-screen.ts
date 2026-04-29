import type { ExerciseDefinition } from '../exercises/types';
import { EXERCISES } from '../exercises/registry';

export type WorkoutMode = 'free' | 'challenge';

export interface WorkoutConfig {
  exercise: ExerciseDefinition;
  mode: WorkoutMode;
  targetReps?: number;
  targetTimeSeconds?: number;
  targetDelaySeconds?: number;
}

const EXERCISE_ICONS: Record<string, string> = {
  squat: '\u{1F3CB}',
  'push-up': '\u{1F4AA}',
  'kettlebell-snatch': '\u{1F3CB}',
};

type BodyPartFilter = 'all' | ExerciseDefinition['bodyPart'];

const BODY_PART_LABEL: Record<ExerciseDefinition['bodyPart'], string> = {
  upper: 'UPPER BODY',
  lower: 'LOWER BODY',
  full: 'FULL BODY',
};

export class StartScreen {
  private root: HTMLElement;
  private stepModeSelect: HTMLElement;
  private stepExercise: HTMLElement;
  private stepChallenge: HTMLElement;
  private exerciseList: HTMLElement;
  private exerciseSearch: HTMLInputElement;
  private exerciseFilter: BodyPartFilter = 'all';
  private exerciseQuery = '';

  private inputReps: HTMLInputElement;
  private inputMin: HTMLInputElement;
  private inputSec: HTMLInputElement;
  private inputDelay: HTMLInputElement;

  private wheelMin: HTMLElement;
  private wheelSec: HTMLElement;
  private wheelDelay: HTMLElement;
  private wheelMinItems: HTMLElement[] = [];
  private wheelSecItems: HTMLElement[] = [];
  private wheelDelayItems: HTMLElement[] = [];
  private wheelSyncing = false;
  private wheelMinScrollHandle = 0;
  private wheelSecScrollHandle = 0;
  private wheelDelayScrollHandle = 0;
  private btnGo: HTMLButtonElement;

  private selectedExercise: ExerciseDefinition | null = null;
  private selectedMode: WorkoutMode | null = null;

  private resolveConfig: ((cfg: WorkoutConfig) => void) | null = null;

  constructor() {
    this.root = document.getElementById('start-screen')!;
    this.stepModeSelect = document.getElementById('step-mode-select')!;
    this.stepExercise = document.getElementById('step-exercise')!;
    this.stepChallenge = document.getElementById('step-challenge')!;
    this.exerciseList = document.getElementById('exercise-list')!;
    this.exerciseSearch = document.getElementById('exercise-search-input') as HTMLInputElement;
    this.inputReps = document.getElementById('input-reps') as HTMLInputElement;
    this.inputMin = document.getElementById('input-min') as HTMLInputElement;
    this.inputSec = document.getElementById('input-sec') as HTMLInputElement;
    this.inputDelay = document.getElementById('input-delay') as HTMLInputElement;
    this.wheelMin = document.getElementById('wheel-min')!;
    this.wheelSec = document.getElementById('wheel-sec')!;
    this.wheelDelay = document.getElementById('wheel-delay')!;
    this.btnGo = document.getElementById('btn-go') as HTMLButtonElement;

    this.renderExerciseList();
    this.initTimeWheels();
    this.bindEvents();
    // Ensure wheel items have layout before syncing scroll positions.
    requestAnimationFrame(() => this.syncChallengeUI());
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

  goHome(): void {
    this.selectedMode = null;
    this.selectedExercise = null;
    this.exerciseFilter = 'all';
    this.exerciseQuery = '';
    this.exerciseSearch.value = '';
    this.renderExerciseList();
    this.syncFilterUI();
    this.showStep('mode-select');
  }

  private reset(): void {
    this.selectedExercise = null;
    this.selectedMode = null;
    this.showStep('mode-select');
    this.exerciseFilter = 'all';
    this.exerciseQuery = '';
    this.exerciseSearch.value = '';
    this.renderExerciseList();
    this.syncFilterUI();
  }

  private renderExerciseList(): void {
    this.exerciseList.innerHTML = '';

    const filterFirst = EXERCISES.filter((ex) => {
      if (this.exerciseFilter === 'all') return true;
      return ex.bodyPart === this.exerciseFilter;
    });

    const q = this.exerciseQuery.trim().toLowerCase();
    const filtered = q
      ? filterFirst.filter((ex) => ex.name.toLowerCase().includes(q))
      : filterFirst;

    for (const ex of filtered) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'exercise-row';
      btn.dataset.exerciseId = ex.id;
      btn.innerHTML = `
        <div class="exercise-row-icon" aria-hidden="true">${EXERCISE_ICONS[ex.id] ?? '\u{1F3CB}'}</div>
        <div class="exercise-row-text">
          <div class="exercise-row-name">${ex.name}</div>
          <div class="exercise-row-part">${BODY_PART_LABEL[ex.bodyPart]}</div>
        </div>
        <div class="exercise-row-chevron" aria-hidden="true">&#x203A;</div>
      `;
      btn.addEventListener('click', () => this.onExercisePick(ex, btn));
      this.exerciseList.appendChild(btn);
    }

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'exercise-empty';
      empty.textContent = 'Nothing found';
      this.exerciseList.appendChild(empty);
    }
  }

  private bindEvents(): void {
    this.stepModeSelect.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.selectedMode = btn.dataset.mode as WorkoutMode;
        this.showStep('exercise');
      });
    });

    document.getElementById('btn-go')!.addEventListener('click', () => this.finish());
    document.getElementById('btn-back-home')!.addEventListener('click', () => this.showStep('mode-select'));
    document.getElementById('btn-back-mode')!.addEventListener('click', () => this.showStep('exercise'));

    this.exerciseSearch.addEventListener('input', () => {
      this.exerciseQuery = this.exerciseSearch.value;
      this.renderExerciseList();
    });

    this.stepExercise.querySelectorAll<HTMLButtonElement>('[data-body-part]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const next = (btn.dataset.bodyPart ?? 'all') as BodyPartFilter;
        this.exerciseFilter = next;
        this.syncFilterUI();
        this.renderExerciseList();
      });
    });

    document.getElementById('btn-reps-dec')!.addEventListener('click', () => this.adjustReps(-1));
    document.getElementById('btn-reps-inc')!.addEventListener('click', () => this.adjustReps(+1));

    this.inputMin.addEventListener('input', () => this.syncChallengeUI());
    this.inputSec.addEventListener('input', () => this.syncChallengeUI());
    this.inputDelay.addEventListener('input', () => this.syncChallengeUI());
    this.inputReps.addEventListener('input', () => this.onRepsInput());
    this.inputReps.addEventListener('blur', () => this.commitReps());

    this.wheelMin.addEventListener('scroll', () => this.onWheelScroll('min'));
    this.wheelSec.addEventListener('scroll', () => this.onWheelScroll('sec'));
    this.wheelDelay.addEventListener('scroll', () => this.onWheelScroll('delay'));
  }

  private onExercisePick(ex: ExerciseDefinition, btn: HTMLButtonElement): void {
    this.selectedExercise = ex;
    this.exerciseList.querySelectorAll('.exercise-row').forEach((c) => c.classList.remove('exercise-row-selected'));
    btn.classList.add('exercise-row-selected');

    setTimeout(() => {
      if (!this.selectedMode) return;
      if (this.selectedMode === 'free') {
        this.finish();
      } else {
        this.showStep('challenge');
      }
    }, 150);
  }

  private showStep(step: 'mode-select' | 'exercise' | 'challenge'): void {
    this.stepModeSelect.classList.toggle('hidden', step !== 'mode-select');
    this.stepExercise.classList.toggle('hidden', step !== 'exercise');
    this.stepChallenge.classList.toggle('hidden', step !== 'challenge');

    if (step === 'challenge') {
      this.syncChallengeUI();
    }
  }

  private syncFilterUI(): void {
    this.stepExercise.querySelectorAll<HTMLButtonElement>('.filter-chip[data-body-part]').forEach((btn) => {
      const id = (btn.dataset.bodyPart ?? 'all') as BodyPartFilter;
      btn.classList.toggle('filter-chip-active', id === this.exerciseFilter);
    });
  }

  private adjustReps(delta: number): void {
    const current = this.parseReps(this.inputReps.value) ?? 0;
    const next = Math.max(0, Math.min(999, current + delta));
    if (next === 0) {
      this.inputReps.value = '';
    } else {
      this.inputReps.value = String(next);
    }
    this.onRepsInput();
  }

  private syncChallengeUI(): void {
    const mins = Math.max(0, Math.min(59, parseInt(this.inputMin.value, 10) || 0));
    const secs = Math.max(0, Math.min(59, parseInt(this.inputSec.value, 10) || 0));
    const delay = Math.max(0, Math.min(59, parseInt(this.inputDelay.value, 10) || 0));
    const repsParsed = this.parseReps(this.inputReps.value);

    this.inputMin.value = String(mins);
    this.inputSec.value = String(secs);
    this.inputDelay.value = String(delay);
    this.syncWheelsTo(mins, secs, delay);

    const totalSeconds = mins * 60 + secs;
    const repsValid = repsParsed !== null && repsParsed > 0;
    const timeValid = totalSeconds >= 10;
    this.btnGo.disabled = !(repsValid && timeValid);
  }

  private onRepsInput(): void {
    const raw = this.inputReps.value;
    if (raw === '') {
      this.syncChallengeUI();
      return;
    }

    // Keep only digits.
    let digits = raw.replace(/[^\d]/g, '');
    if (digits === '') {
      this.inputReps.value = '';
      this.syncChallengeUI();
      return;
    }

    // Trim leading zeros: "05" -> "5"
    digits = digits.replace(/^0+(\d)/, '$1');

    // Clamp to 999 if needed.
    const n = Math.min(999, parseInt(digits, 10) || 0);
    this.inputReps.value = n === 0 ? '' : String(n);
    this.syncChallengeUI();
  }

  private commitReps(): void {
    // On blur, normalize again; leave empty as-is.
    this.onRepsInput();
  }

  private parseReps(value: string): number | null {
    const s = value.trim();
    if (s === '') return null;
    if (!/^\d+$/.test(s)) return null;
    const n = parseInt(s, 10);
    if (!Number.isFinite(n)) return null;
    return Math.max(0, Math.min(999, n));
  }

  private initTimeWheels(): void {
    const build = (root: HTMLElement): HTMLElement[] => {
      root.innerHTML = '';
      const items: HTMLElement[] = [];
      for (let i = 0; i <= 59; i++) {
        const el = document.createElement('div');
        el.className = 'wheel-item';
        el.textContent = String(i).padStart(2, '0');
        el.addEventListener('click', () => {
          // Click-to-set is handy on desktop; on mobile the wheel is primary.
          const type =
            root === this.wheelMin ? 'min'
              : root === this.wheelSec ? 'sec'
              : 'delay';
          this.setWheelValue(type, i, true);
        });
        root.appendChild(el);
        items.push(el);
      }
      return items;
    };

    this.wheelMinItems = build(this.wheelMin);
    this.wheelSecItems = build(this.wheelSec);
    this.wheelDelayItems = build(this.wheelDelay);
  }

  private onWheelScroll(type: 'min' | 'sec' | 'delay'): void {
    if (this.wheelSyncing) return;

    const handleKey =
      type === 'min' ? 'wheelMinScrollHandle'
        : type === 'sec' ? 'wheelSecScrollHandle'
        : 'wheelDelayScrollHandle';
    const prev = this[handleKey] as number;
    if (prev) window.clearTimeout(prev);

    this[handleKey] = window.setTimeout(() => {
      const root =
        type === 'min' ? this.wheelMin
          : type === 'sec' ? this.wheelSec
          : this.wheelDelay;
      const items =
        type === 'min' ? this.wheelMinItems
          : type === 'sec' ? this.wheelSecItems
          : this.wheelDelayItems;
      if (!items.length) return;

      const itemH = items[0].offsetHeight || 40;
      const idx = Math.max(0, Math.min(59, Math.round(root.scrollTop / itemH)));
      this.setWheelValue(type, idx, true);
    }, 90);
  }

  private setWheelValue(type: 'min' | 'sec' | 'delay', value: number, snap: boolean): void {
    const v = Math.max(0, Math.min(59, value));
    if (type === 'min') this.inputMin.value = String(v);
    else if (type === 'sec') this.inputSec.value = String(v);
    else this.inputDelay.value = String(v);

    this.syncChallengeUI();

    if (snap) {
      const root =
        type === 'min' ? this.wheelMin
          : type === 'sec' ? this.wheelSec
          : this.wheelDelay;
      const items =
        type === 'min' ? this.wheelMinItems
          : type === 'sec' ? this.wheelSecItems
          : this.wheelDelayItems;
      const itemH = items[0]?.offsetHeight || 40;
      this.wheelSyncing = true;
      root.scrollTo({ top: v * itemH, behavior: 'smooth' });
      window.setTimeout(() => {
        this.wheelSyncing = false;
      }, 140);
    }
  }

  private syncWheelsTo(mins: number, secs: number, delay: number): void {
    const setActive = (items: HTMLElement[], idx: number): void => {
      for (let i = 0; i < items.length; i++) {
        items[i].classList.toggle('wheel-item-active', i === idx);
      }
    };

    setActive(this.wheelMinItems, mins);
    setActive(this.wheelSecItems, secs);
    setActive(this.wheelDelayItems, delay);

    const itemH = this.wheelMinItems[0]?.getBoundingClientRect().height || 40;
    const minTop = mins * itemH;
    const secTop = secs * itemH;
    const delayTop = delay * itemH;

    // Don't fight user's scrolling; only snap if we're meaningfully off.
    const needsMin = Math.abs(this.wheelMin.scrollTop - minTop) > 1;
    const needsSec = Math.abs(this.wheelSec.scrollTop - secTop) > 1;
    const needsDelay = Math.abs(this.wheelDelay.scrollTop - delayTop) > 1;
    if (!needsMin && !needsSec && !needsDelay) return;

    this.wheelSyncing = true;
    if (needsMin) this.wheelMin.scrollTo({ top: minTop, behavior: 'auto' });
    if (needsSec) this.wheelSec.scrollTo({ top: secTop, behavior: 'auto' });
    if (needsDelay) this.wheelDelay.scrollTo({ top: delayTop, behavior: 'auto' });
    window.setTimeout(() => {
      this.wheelSyncing = false;
    }, 0);
  }

  private finish(): void {
    if (!this.selectedExercise || !this.selectedMode) return;

    const config: WorkoutConfig = {
      exercise: this.selectedExercise,
      mode: this.selectedMode,
    };

    if (this.selectedMode === 'challenge') {
      const repsRaw = this.parseReps(this.inputReps.value);
      const mins = Math.max(0, parseInt(this.inputMin.value, 10) || 0);
      const secs = Math.max(0, parseInt(this.inputSec.value, 10) || 0);
      const delay = Math.max(0, Math.min(59, parseInt(this.inputDelay.value, 10) || 0));
      const totalSeconds = mins * 60 + secs;
      if (totalSeconds < 10) return;
      if (!repsRaw || repsRaw <= 0) return;
      config.targetReps = repsRaw;
      config.targetTimeSeconds = totalSeconds;
      config.targetDelaySeconds = delay;
    }

    this.hide();
    this.resolveConfig?.(config);
    this.resolveConfig = null;
  }
}
