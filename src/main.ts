import { Camera } from './camera';
import { PoseDetector } from './pose-detector';
import { AngleCalculator } from './angle-calculator';
import { ExerciseStateMachine } from './state-machine';
import { TempoTracker } from './tempo-tracker';
import { GestureDetector } from './gesture-detector';
import { ChallengeTracker } from './challenge-tracker';
import { Overlay } from './ui/overlay';
import { HUD } from './ui/hud';
import { Controls } from './ui/controls';
import { StartScreen, type WorkoutConfig } from './ui/start-screen';
import { ResultScreen } from './ui/result-screen';

let running = false;
let sessionActive = false;
let frameCounter = 0;

let config: WorkoutConfig | null = null;
let angleCalc: AngleCalculator;
let stateMachine: ExerciseStateMachine;
let tempo: TempoTracker;
let challenge: ChallengeTracker | null = null;
let lastChallengeUpdate = 0;
let prevRepCount = 0;

const loadingScreen = document.getElementById('loading-screen')!;
const loadingText = document.getElementById('loading-text')!;
const cameraContainer = document.getElementById('camera-container')!;
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
    hud.updateRepCount(0);
    hud.updateTempo(null);
    hud.startTimer();
  }

  if (config?.mode === 'challenge' && config.targetReps && config.targetTimeSeconds) {
    challenge = new ChallengeTracker(config.targetReps, config.targetTimeSeconds);
    challenge.start();
    lastChallengeUpdate = 0;
    hud.updateChallenge({
      remainingReps: config.targetReps,
      remainingSeconds: config.targetTimeSeconds,
      targetTempo: Math.round(config.targetReps / (config.targetTimeSeconds / 60) * 10) / 10,
      currentTempo: 0,
      paceStatus: 'idle',
      completed: false,
      succeeded: false,
    });
  }
}

function stopSession(showResult = true): void {
  sessionActive = false;
  hud.stopTimer();
  gesture.reset();

  if (challenge && showResult) {
    if (!challenge.done) challenge.cancel();
    resultScreen.show(challenge.getResult());
  }
  challenge = null;
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

  if (config?.mode === 'free') {
    hud.updateRepCount(currentCount);
    hud.updateTempo(tempo.lastTempo);
  }

  if (config?.mode === 'challenge' && challenge) {
    if (currentCount > prevRepCount) {
      for (let i = 0; i < currentCount - prevRepCount; i++) {
        challenge.recordRep();
      }
    }
    prevRepCount = currentCount;

    if (timestamp - lastChallengeUpdate > 500) {
      lastChallengeUpdate = timestamp;
      const state = challenge.getState();
      hud.updateChallenge(state);

      if (state.completed) {
        controls.setActive(false);
        resultScreen.show(challenge!.getResult());
        sessionActive = false;
        hud.stopTimer();
        gesture.reset();
        challenge = null;
      }
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

  stateMachine.onChange((event) => tempo.onStateChange(event));

  hud.reset();
  hud.setExerciseName(cfg.exercise.name);
  hud.setMode(cfg.mode);

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
  hud.stopTimer();
  camera.stop();
  cameraContainer.classList.add('hidden');
  resultScreen.hide();
  controls.setActive(false);

  const cfg = await startScreen.show();
  await launchCamera(cfg);
}

async function launchCamera(cfg: WorkoutConfig): Promise<void> {
  initExercise(cfg);
  loadingScreen.classList.remove('hidden');
  loadingText.textContent = 'Starting camera…';

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
