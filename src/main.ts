import { Camera } from './camera';
import { PoseDetector } from './pose-detector';
import { AngleCalculator } from './angle-calculator';
import { ExerciseStateMachine } from './state-machine';
import { TempoTracker } from './tempo-tracker';
import { GestureDetector } from './gesture-detector';
import { Overlay } from './ui/overlay';
import { HUD } from './ui/hud';
import { Controls } from './ui/controls';
import { SQUAT } from './exercises/squat';

const exercise = SQUAT;

let running = false;
let sessionActive = false;
let frameCounter = 0;

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
const angleCalc = new AngleCalculator(exercise);
const stateMachine = new ExerciseStateMachine(exercise);
const tempo = new TempoTracker(exercise);
const gesture = new GestureDetector(1500);
const overlay = new Overlay(canvasEl);
const hud = new HUD();
const controls = new Controls();

stateMachine.onChange((event) => {
  tempo.onStateChange(event);
});

controls.onSessionToggle = (active) => {
  if (active) {
    startSession();
  } else {
    stopSession();
  }
};

function startSession(): void {
  sessionActive = true;
  stateMachine.reset();
  angleCalc.reset();
  tempo.reset();
  hud.reset();
  hud.startTimer();
}

function stopSession(): void {
  sessionActive = false;
  hud.stopTimer();
  gesture.reset();
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

  if (gestureTriggered) {
    controls.toggle();
  }

  if (!sessionActive) return;

  const angles = angleCalc.compute(landmarks, timestamp);
  if (!angles) return;

  stateMachine.update(angles, timestamp);
  hud.updateRepCount(stateMachine.count);
  hud.updateTempo(tempo.lastTempo);
}

function updateGestureUI(): void {
  const p = gesture.progress;
  if (p > 0) {
    gestureIndicatorEl.classList.remove('hidden');
    const circumference = 2 * Math.PI * 45;
    gestureProgressEl.style.strokeDashoffset = String(
      circumference * (1 - p)
    );
  } else {
    gestureIndicatorEl.classList.add('hidden');
  }
}

async function init(): Promise<void> {
  try {
    await detector.init((msg) => {
      loadingText.textContent = msg;
    });

    loadingText.textContent = 'Starting camera…';
    await camera.start();

    overlay.resize();
    window.addEventListener('resize', () => overlay.resize());

    hud.setExerciseName(exercise.name);

    loadingScreen.classList.add('hidden');
    cameraContainer.classList.remove('hidden');

    running = true;
    processFrame();
  } catch (err) {
    console.error('Init failed:', err);
    loadingText.textContent =
      err instanceof Error ? err.message : 'Failed to start. Check camera permissions.';
  }
}

init();
