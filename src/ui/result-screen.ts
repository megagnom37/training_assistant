import type { ChallengeResult, ChallengeStatus } from '../challenge-tracker';

const STATUS_CONFIG: Record<ChallengeStatus, { icon: string; label: string }> = {
  success:   { icon: '\u{1F3C6}', label: 'Выполнено!' },
  failed:    { icon: '\u{274C}',  label: 'Не удалось' },
  cancelled: { icon: '\u{23F9}',  label: 'Отменено' },
};

function formatTime(totalSeconds: number): string {
  const min = Math.floor(totalSeconds / 60);
  const sec = Math.floor(totalSeconds % 60);
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export class ResultScreen {
  private root: HTMLElement;
  private statusIconEl: HTMLElement;
  private statusTextEl: HTMLElement;
  private repsEl: HTMLElement;
  private timeEl: HTMLElement;
  private avgTempoEl: HTMLElement;
  private targetTempoEl: HTMLElement;

  onBack: (() => void) | null = null;

  constructor() {
    this.root = document.getElementById('result-screen')!;
    this.statusIconEl = document.getElementById('result-status-icon')!;
    this.statusTextEl = document.getElementById('result-status-text')!;
    this.repsEl = document.getElementById('result-reps')!;
    this.timeEl = document.getElementById('result-time')!;
    this.avgTempoEl = document.getElementById('result-avg-tempo')!;
    this.targetTempoEl = document.getElementById('result-target-tempo')!;

    document.getElementById('btn-result-back')!.addEventListener('click', () => {
      this.hide();
      this.onBack?.();
    });
  }

  show(result: ChallengeResult): void {
    const cfg = STATUS_CONFIG[result.status];

    this.statusIconEl.textContent = cfg.icon;
    this.statusTextEl.textContent = cfg.label;
    this.statusTextEl.className = '';
    this.statusTextEl.id = 'result-status-text';
    this.statusTextEl.classList.add(result.status);

    this.repsEl.textContent = `${result.actualReps} / ${result.targetReps}`;
    this.timeEl.textContent =
      `${formatTime(result.elapsedSeconds)} / ${formatTime(result.targetTimeSeconds)}`;
    this.avgTempoEl.textContent = `${result.averageTempo} повт/мин`;
    this.targetTempoEl.textContent = `${result.targetTempo} повт/мин`;

    this.root.classList.remove('hidden');
  }

  hide(): void {
    this.root.classList.add('hidden');
  }
}
