import type { ChallengeResult, ChallengeStatus, PaceSample } from '../challenge-tracker';
import { getStoredProfile } from '../google/auth';

const STATUS_CONFIG: Record<ChallengeStatus, { icon: string; label: string }> = {
  success:   { icon: '\u{1F3C6}', label: 'Completed' },
  failed:    { icon: '\u{274C}',  label: 'Failed' },
  cancelled: { icon: '\u{23F9}',  label: 'Canceled' },
};

function formatTime(totalSeconds: number): string {
  const min = Math.floor(totalSeconds / 60);
  const sec = Math.floor(totalSeconds % 60);
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
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

export type ResultPayload = ChallengeResult | FreeModeResult;

const SAVE_LABEL_SIGNED_IN = 'SAVE WORKOUT';
const SAVE_LABEL_NEED_AUTH = 'SIGN IN TO SAVE';

export class ResultScreen {
  private lastPayload: ResultPayload | null = null;

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
  private freeChartYMaxEl: HTMLElement;
  private freeChartYMidEl: HTMLElement;
  private btnFreeBack: HTMLButtonElement;
  private btnSave: HTMLButtonElement;
  private btnHome: HTMLButtonElement;

  private challengeRoot: HTMLElement;
  private statusTextEl: HTMLElement;
  private challengeSubtitleEl: HTMLElement;
  private challengeTimeTargetEl: HTMLElement;
  private challengeTimeActualEl: HTMLElement;
  private challengeRepsTargetEl: HTMLElement;
  private challengeRepsActualEl: HTMLElement;
  private challengeTempoTargetEl: HTMLElement;
  private challengeTempoAvgEl: HTMLElement;
  private btnChallengeBack: HTMLButtonElement;
  private btnChallengeSave: HTMLButtonElement;
  private btnChallengeHome: HTMLButtonElement;
  private challengeChartRoot: HTMLElement;
  private challengeChartBarsEl: HTMLElement;
  private challengeChartRangeEl: HTMLElement;
  private challengeChartYMaxEl: HTMLElement;
  private challengeChartYMidEl: HTMLElement;

  onBack: (() => void) | null = null;

  /** Persist workout stub (Google Drive JSON); throws on failure. */
  onSaveWorkout: (() => Promise<void>) | null = null;

  /** User tapped save while signed out — open Account / Google sign-in; result stays underneath. */
  onRequestSignInForSave: (() => void) | null = null;

  /** Invoked whenever the result layer is hidden (home, back, after save). */
  onHide: (() => void) | null = null;

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
    this.freeChartYMaxEl = document.getElementById('result-free-chart-y-max')!;
    this.freeChartYMidEl = document.getElementById('result-free-chart-y-mid')!;
    this.btnFreeBack = document.getElementById('btn-result-free-back') as HTMLButtonElement;
    this.btnSave = document.getElementById('btn-result-save') as HTMLButtonElement;
    this.btnHome = document.getElementById('btn-result-home') as HTMLButtonElement;

    this.challengeRoot = document.getElementById('result-challenge')!;
    this.statusTextEl = document.getElementById('result-status-text')!;
    this.challengeSubtitleEl = document.getElementById('result-challenge-subtitle')!;
    this.challengeTimeTargetEl = document.getElementById('result-challenge-time-target')!;
    this.challengeTimeActualEl = document.getElementById('result-challenge-time-actual')!;
    this.challengeRepsTargetEl = document.getElementById('result-challenge-reps-target')!;
    this.challengeRepsActualEl = document.getElementById('result-challenge-reps-actual')!;
    this.challengeTempoTargetEl = document.getElementById('result-challenge-tempo-target')!;
    this.challengeTempoAvgEl = document.getElementById('result-challenge-tempo-avg')!;
    this.btnChallengeBack = document.getElementById('btn-result-challenge-back') as HTMLButtonElement;
    this.btnChallengeSave = document.getElementById('btn-result-challenge-save') as HTMLButtonElement;
    this.btnChallengeHome = document.getElementById('btn-result-challenge-home') as HTMLButtonElement;
    this.challengeChartRoot = document.getElementById('result-challenge-chart')!;
    this.challengeChartBarsEl = document.getElementById('result-challenge-chart-bars')!;
    this.challengeChartRangeEl = document.getElementById('result-challenge-chart-range')!;
    this.challengeChartYMaxEl = document.getElementById('result-challenge-chart-y-max')!;
    this.challengeChartYMidEl = document.getElementById('result-challenge-chart-y-mid')!;

    this.btnFreeBack.addEventListener('click', () => {
      this.hide();
      this.onBack?.();
    });
    this.btnHome.addEventListener('click', () => {
      this.hide();
      this.onBack?.();
    });
    this.btnSave.addEventListener('click', () => void this.handleSaveWorkout());

    this.btnChallengeBack.addEventListener('click', () => {
      this.hide();
      this.onBack?.();
    });
    this.btnChallengeHome.addEventListener('click', () => {
      this.hide();
      this.onBack?.();
    });
    this.btnChallengeSave.addEventListener('click', () => void this.handleSaveWorkout());
  }

  private async handleSaveWorkout(): Promise<void> {
    if (!this.onSaveWorkout) {
      window.alert('Save is not configured.');
      return;
    }

    if (!getStoredProfile()) {
      this.onRequestSignInForSave?.();
      return;
    }

    const buttons = [this.btnSave, this.btnChallengeSave];
    for (const b of buttons) {
      b.disabled = true;
    }
    try {
      await this.onSaveWorkout();
      this.hide();
      this.onBack?.();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      for (const b of buttons) {
        b.disabled = false;
      }
    }
  }

  /** Update save button captions after returning from Google sign-in (same result still on screen). */
  refreshSaveButtonLabels(): void {
    this.updateSaveButtonLabels();
  }

  private updateSaveButtonLabels(): void {
    const signedIn = Boolean(getStoredProfile());
    const label = signedIn ? SAVE_LABEL_SIGNED_IN : SAVE_LABEL_NEED_AUTH;
    this.btnSave.textContent = label;
    this.btnChallengeSave.textContent = label;
  }

  show(result: ResultPayload): void {
    this.lastPayload = result;
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
      this.renderPaceChart(
        this.freeChartRoot,
        this.freeChartBarsEl,
        this.freeChartRangeEl,
        this.freeChartYMaxEl,
        this.freeChartYMidEl,
        r.paceSamples,
        r.elapsedSeconds
      );
    } else {
      const cr = result as ChallengeResult;
      const cfg = STATUS_CONFIG[cr.status];

      this.statusTextEl.textContent = cfg.label;
      this.statusTextEl.className = '';
      this.statusTextEl.id = 'result-status-text';
      this.statusTextEl.classList.add(cr.status);

      const exerciseName = (cr.exerciseName ?? '').trim();
      this.challengeSubtitleEl.textContent = exerciseName
        ? `${exerciseName.toUpperCase()} (CHALLENGE)`
        : `CHALLENGE`;

      this.challengeTimeTargetEl.textContent = formatTime(cr.targetTimeSeconds);
      this.challengeTimeActualEl.textContent = formatTime(cr.elapsedSeconds);

      this.challengeRepsTargetEl.textContent = String(cr.targetReps);
      this.challengeRepsActualEl.textContent = String(cr.actualReps);

      this.challengeTempoTargetEl.textContent = formatRpm(cr.targetTempo);
      this.challengeTempoAvgEl.textContent = formatRpm(cr.averageTempo);

      this.renderPaceChart(
        this.challengeChartRoot,
        this.challengeChartBarsEl,
        this.challengeChartRangeEl,
        this.challengeChartYMaxEl,
        this.challengeChartYMidEl,
        cr.paceSamples,
        cr.elapsedSeconds
      );
    }

    this.updateSaveButtonLabels();
    this.root.classList.remove('hidden');
  }

  /** Payload from the last `show()` — cleared on `hide()`; used when saving to Drive. */
  getPayloadForSave(): ResultPayload | null {
    return this.lastPayload;
  }

  hide(): void {
    this.root.classList.add('hidden');
    this.lastPayload = null;
    this.onHide?.();
  }

  private renderPaceChart(
    chartRoot: HTMLElement,
    chartBarsEl: HTMLElement,
    chartRangeEl: HTMLElement,
    chartYMaxEl: HTMLElement,
    chartYMidEl: HTMLElement,
    samples: readonly PaceSample[],
    elapsedSeconds: number
  ): void {
    const series = aggregateToMaxBars(samples, elapsedSeconds, 10);
    const max = series.reduce((m, s) => (s.rpm !== null && s.rpm > m ? s.rpm : m), 0);

    chartBarsEl.replaceChildren();

    if (series.length === 0 || max <= 0) {
      chartRoot.classList.add('hidden');
      return;
    }

    chartRoot.classList.remove('hidden');

    chartYMaxEl.textContent = formatChartAxisRpm(max);
    chartYMidEl.textContent = formatChartAxisRpm(max / 2);

    for (const s of series) {
      const bar = document.createElement('div');
      bar.className = 'result-chart-bar';
      const rpm = s.rpm ?? 0;
      const h = max > 0 ? Math.max(0, Math.min(1, rpm / max)) : 0;
      bar.style.height = `${Math.round(h * 1000) / 10}%`;
      bar.title = `${formatTime(Math.round(s.t))} — ${formatRpm(s.rpm)} RPM`;
      if (s.rpm === null) bar.classList.add('is-empty');
      chartBarsEl.appendChild(bar);
    }

    chartRangeEl.textContent = `${formatTime(0)} \u2192 ${formatTime(elapsedSeconds)}`;
  }
}

function formatRpm(v: number | null): string {
  if (v === null || !Number.isFinite(v) || v <= 0) return '--';
  return v >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10);
}

/** Y-axis ticks (RPM) — readable integers or one decimal. */
function formatChartAxisRpm(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '0';
  if (value >= 100) return String(Math.round(value));
  return String(Math.round(value * 10) / 10);
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
