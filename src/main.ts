import { Camera } from './camera';
import { PoseDetector } from './pose-detector';
import { AngleCalculator } from './angle-calculator';
import { ExerciseStateMachine } from './state-machine';
import { TempoTracker } from './tempo-tracker';
import { GestureDetector } from './gesture-detector';
import { ChallengeTracker, type PaceSample } from './challenge-tracker';
import { Overlay } from './ui/overlay';
import { HUD } from './ui/hud';
import { Controls } from './ui/controls';
import { StartScreen, type WorkoutConfig } from './ui/start-screen';
import { ResultScreen } from './ui/result-screen';
import { computeRollingRpm } from './rolling-rpm';
import type { ChallengeResult } from './challenge-tracker';
import { appendWorkout, type WorkoutHistoryNewEntry } from './google/workout-history-drive';
import type { ResultPayload } from './ui/result-screen';
import { AccountHistoryPanels } from './ui/account-history-panels';

let running = false;
let sessionActive = false;
let frameCounter = 0;

let config: WorkoutConfig | null = null;
let angleCalc: AngleCalculator;
let stateMachine: ExerciseStateMachine;
let tempo: TempoTracker;
let challenge: ChallengeTracker | null = null;
let prevRepCount = 0;
let freeSessionStart = 0;
/** Rep completion timestamps (challenge-style rolling tempo window). */
let freeRepTimestamps: number[] = [];
/** Peak rolling RPM during this free session (same formula as HUD). */
let freeMaxRollingRpm: number | null = null;
let freePaceSamples: PaceSample[] = [];
let freePaceHandle = 0;
let challengeCountdownHandle = 0;
let challengeCountdownEndsAt = 0;
let challengeStateHandle = 0;

const loadingScreen = document.getElementById('loading-screen')!;
const loadingText = document.getElementById('loading-text')!;
const cameraContainer = document.getElementById('camera-container')!;
const startScreenEl = document.getElementById('start-screen')!;
const bottomNav = document.getElementById('bottom-nav')!;
const gestureIndicatorEl = document.getElementById('gesture-indicator')!;
const gestureProgressEl = document.getElementById(
  'gesture-progress'
) as unknown as SVGCircleElement;

const videoEl = document.getElementById('camera-video') as HTMLVideoElement;
const canvasEl = document.getElementById('overlay-canvas') as HTMLCanvasElement;

const camera = new Camera(videoEl);
const detector = new PoseDetector();
const gesture = new GestureDetector(1500);
const overlay = new Overlay(canvasEl);
const hud = new HUD();
const controls = new Controls();
const startScreen = new StartScreen();
const resultScreen = new ResultScreen();

/** Opened Account from result save while signed out; restore UI after sign-in or panel close. */
let pendingResumeResultAfterAuth = false;

function endResultAuthChrome(): void {
  bottomNav.classList.remove('bottom-nav--above-overlay');
  bottomNav.classList.add('hidden');
}

const sidePanels = new AccountHistoryPanels({
  getResumePending: () => pendingResumeResultAfterAuth,
  onGoogleSignInSuccess: () => {
    if (!pendingResumeResultAfterAuth) return;
    sidePanels.close();
    pendingResumeResultAfterAuth = false;
    resultScreen.refreshSaveButtonLabels();
  },
  onClosedWithResumePending: () => {
    endResultAuthChrome();
  },
});

function buildHistoryEntry(payload: ResultPayload): WorkoutHistoryNewEntry {
  const createdAt = new Date().toISOString();
  if ('kind' in payload && payload.kind === 'free') {
    return {
      createdAt,
      mode: 'free',
      exerciseName: payload.exerciseName,
      durationSeconds: Math.max(0, Math.floor(payload.elapsedSeconds)),
      totalReps: payload.reps,
      avgRateRpm:
        payload.averageRpm !== null && Number.isFinite(payload.averageRpm)
          ? payload.averageRpm
          : null,
    };
  }
  const cr = payload as ChallengeResult;
  return {
    createdAt,
    mode: 'challenge',
    exerciseName: (cr.exerciseName ?? '').trim() || 'Workout',
    result: cr.status,
    targetTimeSeconds: cr.targetTimeSeconds,
    elapsedSeconds: cr.elapsedSeconds,
    targetReps: cr.targetReps,
    doneReps: cr.actualReps,
    avgRateRpm: cr.averageTempo,
  };
}

resultScreen.onSaveWorkout = async () => {
  const payload = resultScreen.getPayloadForSave();
  if (!payload) {
    throw new Error('No workout data to save.');
  }
  await appendWorkout(buildHistoryEntry(payload));
};

resultScreen.onRequestSignInForSave = () => {
  pendingResumeResultAfterAuth = true;
  bottomNav.classList.remove('hidden');
  bottomNav.classList.add('bottom-nav--above-overlay');
  sidePanels.openAccount({ overlayResult: true });
};

resultScreen.onHide = () => {
  pendingResumeResultAfterAuth = false;
  bottomNav.classList.remove('bottom-nav--above-overlay');
};

document.getElementById('nav-workout')!.addEventListener('click', () => {
  // "Workout" returns to home (mode selection) everywhere except active camera.
  if (!cameraContainer.classList.contains('hidden')) return;
  if (sidePanels.isOpen()) sidePanels.close();
  resultScreen.hide();
  if (startScreenEl.classList.contains('hidden')) {
    void goToStartScreen();
  } else {
    startScreen.goHome();
  }
});

controls.onSessionToggle = (active) => {
  if (active) startSession();
  else stopSession();
};

resultScreen.onBack = () => goToStartScreen();

document.getElementById('btn-back-start')!.addEventListener('click', () => {
  goToStartScreen();
});

function startSession(): void {
  sessionActive = true;
  stateMachine.reset();
  angleCalc.reset();
  tempo.reset();
  prevRepCount = 0;

  if (config?.mode === 'free') {
    freeSessionStart = performance.now();
    freeRepTimestamps = [];
    freeMaxRollingRpm = null;
    freePaceSamples = [];
    startFreePaceSampling();
    hud.updateRepCount(0);
    hud.updateRollingRpmFree(null);
    hud.startTimer();
  }

  if (config?.mode === 'challenge' && config.targetReps && config.targetTimeSeconds) {
    const delay = Math.max(0, Math.min(59, config.targetDelaySeconds ?? 0));

    // Reset UI to "not started yet" values.
    hud.updateChallenge({
      remainingReps: config.targetReps,
      remainingSeconds: config.targetTimeSeconds,
      targetTempo: Math.round((config.targetReps / (config.targetTimeSeconds / 60)) * 10) / 10,
      currentTempo: 0,
      paceStatus: 'idle',
      completed: false,
      succeeded: false,
    });

    if (delay > 0) {
      // Pre-start countdown: do not count reps or time yet.
      sessionActive = false;
      challenge = null;
      startChallengeCountdown(delay);
      return;
    }

    beginChallenge();
  }
}

function stopSession(showResult = true): void {
  sessionActive = false;
  hud.stopTimer();
  gesture.reset();
  stopFreePaceSampling();

  if (challengeStateHandle) {
    window.clearInterval(challengeStateHandle);
    challengeStateHandle = 0;
  }

  if (challengeCountdownHandle) {
    window.clearInterval(challengeCountdownHandle);
    challengeCountdownHandle = 0;
    challengeCountdownEndsAt = 0;
    // Cancel pending start; no results.
    challenge = null;
    const labelEl = document.getElementById('challenge-time-label');
    if (labelEl) labelEl.textContent = 'TIME LEFT';
    const timerEl = document.getElementById('challenge-timer');
    if (timerEl && config?.mode === 'challenge' && config.targetTimeSeconds) {
      const mm = Math.floor(config.targetTimeSeconds / 60);
      const ss = Math.floor(config.targetTimeSeconds % 60);
      timerEl.textContent = `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
    }
    return;
  }

  if (config?.mode === 'free' && showResult) {
    const reps = stateMachine.count;
    const elapsedPreciseMs =
      freeSessionStart > 0 ? performance.now() - freeSessionStart : 0;
    const elapsedSeconds = Math.max(0, Math.floor(elapsedPreciseMs / 1000));
    recordFreePaceSample(performance.now());

    // Session throughput — same notion as HUD/challenge aggregate (includes rest between reps).
    const averageRpm =
      reps > 0 && elapsedPreciseMs > 0 ? reps / (elapsedPreciseMs / 60000) : null;
    let maxRpm = freeMaxRollingRpm;
    if (maxRpm === null && reps > 0 && freeSessionStart > 0) {
      maxRpm = computeRollingRpm(freeRepTimestamps, freeSessionStart, performance.now());
    }

    resultScreen.show({
      kind: 'free',
      exerciseName: config.exercise.name,
      reps,
      elapsedSeconds,
      averageRpm,
      maxRpm,
      paceSamples: freePaceSamples,
    });

    running = false;
    camera.stop();
    cameraContainer.classList.add('hidden');
    bottomNav.classList.add('hidden');
    return;
  }

  if (challenge && showResult) {
    if (!challenge.done) challenge.cancel();
    resultScreen.show({
      ...challenge.getResult(),
      exerciseName: config?.exercise?.name,
    });
    running = false;
    camera.stop();
    cameraContainer.classList.add('hidden');
    bottomNav.classList.add('hidden');
  }
  challenge = null;
}

function beginChallenge(): void {
  if (!config || config.mode !== 'challenge' || !config.targetReps || !config.targetTimeSeconds) return;
  challenge = new ChallengeTracker(config.targetReps, config.targetTimeSeconds);
  challenge.start();
  sessionActive = true;

  if (challengeStateHandle) window.clearInterval(challengeStateHandle);
  challengeStateHandle = window.setInterval(() => {
    if (!challenge || config?.mode !== 'challenge') return;
    const state = challenge.getState();
    hud.updateChallenge(state);

    if (state.completed) {
      controls.setActive(false);
      resultScreen.show({
        ...challenge.getResult(),
        exerciseName: config?.exercise?.name,
      });
      running = false;
      camera.stop();
      cameraContainer.classList.add('hidden');
      bottomNav.classList.add('hidden');
      sessionActive = false;
      gesture.reset();
      challenge = null;
      if (challengeStateHandle) {
        window.clearInterval(challengeStateHandle);
        challengeStateHandle = 0;
      }
    }
  }, 250);
}

function startChallengeCountdown(delaySeconds: number): void {
  if (!config || config.mode !== 'challenge') return;
  const start = performance.now();
  challengeCountdownEndsAt = start + delaySeconds * 1000;

  const tick = (): void => {
    const now = performance.now();
    const remaining = Math.max(0, Math.ceil((challengeCountdownEndsAt - now) / 1000));
    const timerEl = document.getElementById('challenge-timer');
    const labelEl = document.getElementById('challenge-time-label');
    if (labelEl) labelEl.textContent = 'STARTS IN';
    if (timerEl) timerEl.textContent = `00:${String(remaining).padStart(2, '0')}`;

    if (remaining <= 0) {
      window.clearInterval(challengeCountdownHandle);
      challengeCountdownHandle = 0;
      challengeCountdownEndsAt = 0;
      if (labelEl) labelEl.textContent = 'TIME LEFT';
      beginChallenge();
    }
  };

  tick();
  challengeCountdownHandle = window.setInterval(tick, 250);
}

function processFrame(): void {
  if (!running) return;
  requestAnimationFrame(processFrame);

  frameCounter++;
  if (frameCounter % 2 !== 0) return;
  if (!camera.ready) return;

  const timestamp = performance.now();
  const result = detector.detect(videoEl, timestamp);

  if (!result?.landmarks?.[0]) {
    overlay.clear();
    return;
  }

  const landmarks = result.landmarks[0];
  overlay.draw(landmarks);

  const gestureTriggered = gesture.update(landmarks, timestamp);
  updateGestureUI();
  if (gestureTriggered) controls.toggle();

  if (!sessionActive) return;

  const angles = angleCalc.compute(landmarks, timestamp);
  if (!angles) return;

  stateMachine.update(angles, timestamp);
  const currentCount = stateMachine.count;

  if (currentCount > prevRepCount) {
    const delta = currentCount - prevRepCount;
    if (config?.mode === 'free') {
      for (let i = 0; i < delta; i++) freeRepTimestamps.push(timestamp);
    }
    if (config?.mode === 'challenge' && challenge) {
      for (let i = 0; i < delta; i++) challenge.recordRep();
    }
  }
  prevRepCount = currentCount;

  if (config?.mode === 'free') {
    hud.updateRepCount(currentCount);
    const rpmDisp =
      freeRepTimestamps.length === 0
        ? null
        : computeRollingRpm(freeRepTimestamps, freeSessionStart, timestamp);
    hud.updateRollingRpmFree(rpmDisp);
    if (freeRepTimestamps.length > 0 && rpmDisp !== null) {
      freeMaxRollingRpm = Math.max(freeMaxRollingRpm ?? 0, rpmDisp);
    }
  }
}

function updateGestureUI(): void {
  const p = gesture.progress;
  if (p > 0) {
    gestureIndicatorEl.classList.remove('hidden');
    const circumference = 2 * Math.PI * 45;
    gestureProgressEl.style.strokeDashoffset = String(circumference * (1 - p));
  } else {
    gestureIndicatorEl.classList.add('hidden');
  }
}

function initExercise(cfg: WorkoutConfig): void {
  config = cfg;
  angleCalc = new AngleCalculator(cfg.exercise);
  stateMachine = new ExerciseStateMachine(cfg.exercise);
  tempo = new TempoTracker(cfg.exercise);
  challenge = null;
  if (challengeCountdownHandle) {
    window.clearInterval(challengeCountdownHandle);
    challengeCountdownHandle = 0;
    challengeCountdownEndsAt = 0;
  }
  if (challengeStateHandle) {
    window.clearInterval(challengeStateHandle);
    challengeStateHandle = 0;
  }

  stateMachine.onChange((event) => tempo.onStateChange(event));

  hud.reset();
  hud.setExerciseName(cfg.exercise.name);
  hud.setMode(cfg.mode);
  const labelEl = document.getElementById('challenge-time-label');
  if (labelEl) labelEl.textContent = 'TIME LEFT';

  if (cfg.mode === 'challenge' && cfg.targetReps && cfg.targetTimeSeconds) {
    hud.updateChallenge({
      remainingReps: cfg.targetReps,
      remainingSeconds: cfg.targetTimeSeconds,
      targetTempo: Math.round(cfg.targetReps / (cfg.targetTimeSeconds / 60) * 10) / 10,
      currentTempo: 0,
      paceStatus: 'idle',
      completed: false,
      succeeded: false,
    });
  }
}

async function goToStartScreen(): Promise<void> {
  running = false;
  sessionActive = false;
  challenge = null;
  freeSessionStart = 0;
  freeRepTimestamps = [];
  freeMaxRollingRpm = null;
  stopFreePaceSampling();
  if (challengeCountdownHandle) {
    window.clearInterval(challengeCountdownHandle);
    challengeCountdownHandle = 0;
    challengeCountdownEndsAt = 0;
  }
  if (challengeStateHandle) {
    window.clearInterval(challengeStateHandle);
    challengeStateHandle = 0;
  }
  hud.stopTimer();
  camera.stop();
  cameraContainer.classList.add('hidden');
  bottomNav.classList.remove('hidden');
  resultScreen.hide();
  controls.setActive(false);

  const cfg = await startScreen.show();
  await launchCamera(cfg);
}

function startFreePaceSampling(): void {
  stopFreePaceSampling();
  if (config?.mode !== 'free') return;
  freePaceHandle = window.setInterval(() => {
    if (!sessionActive || config?.mode !== 'free') return;
    recordFreePaceSample(performance.now());
  }, 10_000);
}

function stopFreePaceSampling(): void {
  if (freePaceHandle) {
    window.clearInterval(freePaceHandle);
    freePaceHandle = 0;
  }
}

function recordFreePaceSample(now: number): void {
  if (!freeSessionStart) return;
  const elapsedSeconds = Math.max(0, Math.floor((now - freeSessionStart) / 1000));
  if (elapsedSeconds <= 0) return;

  const rpm =
    freeRepTimestamps.length === 0
      ? null
      : computeRollingRpm(freeRepTimestamps, freeSessionStart, now);
  const last = freePaceSamples.length > 0 ? freePaceSamples[freePaceSamples.length - 1] : null;
  if (last && last.t === elapsedSeconds) return;
  freePaceSamples.push({ t: elapsedSeconds, rpm });
}

async function launchCamera(cfg: WorkoutConfig): Promise<void> {
  initExercise(cfg);
  loadingScreen.classList.remove('hidden');
  loadingText.textContent = 'Starting camera…';
  bottomNav.classList.add('hidden');

  try {
    await camera.start();
    overlay.resize();
    loadingScreen.classList.add('hidden');
    cameraContainer.classList.remove('hidden');
    running = true;
    frameCounter = 0;
    processFrame();
  } catch (err) {
    console.error('Camera failed:', err);
    loadingText.textContent =
      err instanceof Error ? err.message : 'Failed to start. Check camera permissions.';
  }
}

async function init(): Promise<void> {
  try {
    await detector.init((msg) => {
      loadingText.textContent = msg;
    });

    loadingScreen.classList.add('hidden');
    bottomNav.classList.remove('hidden');
    sidePanels.refreshAccountUI();

    const cfg = await startScreen.show();
    await launchCamera(cfg);

    window.addEventListener('resize', () => overlay.resize());
  } catch (err) {
    console.error('Init failed:', err);
    loadingText.textContent =
      err instanceof Error ? err.message : 'Failed to start. Check camera permissions.';
  }
}

init();
