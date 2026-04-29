import type { ChallengeResult, ChallengeStatus } from '../challenge-tracker';

const STATUS_CONFIG: Record<ChallengeStatus, { icon: string; label: string }> = {
  success:   { icon: '\u{1F3C6}', label: 'Completed!' },
  failed:    { icon: '\u{274C}',  label: 'Failed' },
  cancelled: { icon: '\u{23F9}',  label: 'Cancelled' },
};

function formatTime(totalSeconds: number): string {
  const min = Math.floor(totalSeconds / 60);
  const sec = Math.floor(totalSeconds % 60);
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export interface PaceSample {
  t: number; // seconds since session start
  rpm: number | null;
}

export interface FreeModeResult {
  kind: 'free';
  exerciseName: string;
  reps: number;
  elapsedSeconds: number;
  averageRpm: number | null;
  maxRpm: number | null;
  paceSamples: PaceSample[];
}

type ResultPayload = ChallengeResult | FreeModeResult;

export class ResultScreen {
  private root: HTMLElement;

  private freeRoot: HTMLElement;
  private freeSubtitleEl: HTMLElement;
  private freeRepsEl: HTMLElement;
  private freeTimeEl: HTMLElement;
  private freeAvgEl: HTMLElement;
  private freeMaxEl: HTMLElement;
  private freeChartRoot: HTMLElement;
  private freeChartBarsEl: HTMLElement;
  private freeChartRangeEl: HTMLElement;
  private btnFreeBack: HTMLButtonElement;
  private btnSave: HTMLButtonElement;
  private btnHome: HTMLButtonElement;

  private challengeRoot: HTMLElement;
  private statusIconEl: HTMLElement;
  private statusTextEl: HTMLElement;
  private repsEl: HTMLElement;
  private timeEl: HTMLElement;
  private avgTempoEl: HTMLElement;
  private targetTempoEl: HTMLElement;

  onBack: (() => void) | null = null;

  constructor() {
    this.root = document.getElementById('result-screen')!;

    this.freeRoot = document.getElementById('result-free')!;
    this.freeSubtitleEl = document.getElementById('result-free-subtitle')!;
    this.freeRepsEl = document.getElementById('result-free-reps')!;
    this.freeTimeEl = document.getElementById('result-free-time')!;
    this.freeAvgEl = document.getElementById('result-free-avg')!;
    this.freeMaxEl = document.getElementById('result-free-max')!;
    this.freeChartRoot = document.getElementById('result-free-chart')!;
    this.freeChartBarsEl = document.getElementById('result-free-chart-bars')!;
    this.freeChartRangeEl = document.getElementById('result-free-chart-range')!;
    this.btnFreeBack = document.getElementById('btn-result-free-back') as HTMLButtonElement;
    this.btnSave = document.getElementById('btn-result-save') as HTMLButtonElement;
    this.btnHome = document.getElementById('btn-result-home') as HTMLButtonElement;

    this.challengeRoot = document.getElementById('result-challenge')!;
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

    this.btnFreeBack.addEventListener('click', () => {
      this.hide();
      this.onBack?.();
    });
    this.btnHome.addEventListener('click', () => {
      this.hide();
      this.onBack?.();
    });
    this.btnSave.addEventListener('click', () => {
      // Mock save: confirm and go home.
      window.alert('Saved');
      this.hide();
      this.onBack?.();
    });
  }

  show(result: ResultPayload): void {
    const isFree = (result as FreeModeResult).kind === 'free';
    this.freeRoot.classList.toggle('hidden', !isFree);
    this.challengeRoot.classList.toggle('hidden', isFree);

    if (isFree) {
      const r = result as FreeModeResult;
      this.freeSubtitleEl.textContent = `${r.exerciseName.toUpperCase()} (FREE)`;
      this.freeRepsEl.textContent = String(r.reps);
      this.freeTimeEl.textContent = `${formatTime(r.elapsedSeconds)} TOTAL TIME`;
      this.freeAvgEl.textContent = formatRpm(r.averageRpm);
      this.freeMaxEl.textContent = formatRpm(r.maxRpm);
      this.renderFreePaceChart(r.paceSamples, r.elapsedSeconds);
    } else {
      const cr = result as ChallengeResult;
      const cfg = STATUS_CONFIG[cr.status];

      this.statusIconEl.textContent = cfg.icon;
      this.statusTextEl.textContent = cfg.label;
      this.statusTextEl.className = '';
      this.statusTextEl.id = 'result-status-text';
      this.statusTextEl.classList.add(cr.status);

      this.repsEl.textContent = `${cr.actualReps} / ${cr.targetReps}`;
      this.timeEl.textContent = `${formatTime(cr.elapsedSeconds)} / ${formatTime(cr.targetTimeSeconds)}`;
      this.avgTempoEl.textContent = `${cr.averageTempo} reps/min`;
      this.targetTempoEl.textContent = `${cr.targetTempo} reps/min`;
    }

    this.root.classList.remove('hidden');
  }

  hide(): void {
    this.root.classList.add('hidden');
  }

  private renderFreePaceChart(samples: readonly PaceSample[], elapsedSeconds: number): void {
    const series = aggregateToMaxBars(samples, elapsedSeconds, 10);
    const max = series.reduce((m, s) => (s.rpm !== null && s.rpm > m ? s.rpm : m), 0);

    this.freeChartBarsEl.replaceChildren();

    if (series.length === 0 || max <= 0) {
      this.freeChartRoot.classList.add('hidden');
      return;
    }

    this.freeChartRoot.classList.remove('hidden');

    for (const s of series) {
      const bar = document.createElement('div');
      bar.className = 'result-chart-bar';
      const rpm = s.rpm ?? 0;
      const h = max > 0 ? Math.max(0, Math.min(1, rpm / max)) : 0;
      bar.style.height = `${Math.round(h * 1000) / 10}%`;
      bar.title = `${formatTime(Math.round(s.t))} — ${formatRpm(s.rpm)} RPM`;
      if (s.rpm === null) bar.classList.add('is-empty');
      this.freeChartBarsEl.appendChild(bar);
    }

    this.freeChartRangeEl.textContent = `${formatTime(0)} \u2192 ${formatTime(elapsedSeconds)}`;
  }
}

function formatRpm(v: number | null): string {
  if (v === null || !Number.isFinite(v) || v <= 0) return '--';
  return v >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10);
}

function aggregateToMaxBars(
  samples: readonly PaceSample[],
  elapsedSeconds: number,
  maxBars: number
): PaceSample[] {
  const clean = samples
    .filter((s) => Number.isFinite(s.t) && s.t >= 0)
    .slice()
    .sort((a, b) => a.t - b.t);

  if (elapsedSeconds <= 0) return [];
  if (clean.length === 0) return [];
  if (clean.length <= maxBars) return clean;

  const bars = Math.max(1, Math.floor(maxBars));
  const buckets: { sum: number; count: number; tSum: number }[] = Array.from(
    { length: bars },
    () => ({ sum: 0, count: 0, tSum: 0 })
  );

  for (const s of clean) {
    const t = Math.min(elapsedSeconds, Math.max(0, s.t));
    const idx = Math.min(bars - 1, Math.floor((t / elapsedSeconds) * bars));
    if (s.rpm === null || !Number.isFinite(s.rpm) || s.rpm <= 0) continue;
    buckets[idx].sum += s.rpm;
    buckets[idx].count += 1;
    buckets[idx].tSum += t;
  }

  const result: PaceSample[] = [];
  for (let i = 0; i < buckets.length; i++) {
    const b = buckets[i];
    const tMid = ((i + 0.5) / bars) * elapsedSeconds;
    if (b.count === 0) {
      result.push({ t: tMid, rpm: null });
    } else {
      result.push({ t: b.tSum / b.count, rpm: b.sum / b.count });
    }
  }
  return result;
}
