import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

const POSE_CONNECTIONS: [number, number][] = [
  [11, 12], // shoulders
  [11, 13], [13, 15], // left arm
  [12, 14], [14, 16], // right arm
  [11, 23], [12, 24], // torso sides
  [23, 24], // hips
  [23, 25], [25, 27], // left leg
  [24, 26], [26, 28], // right leg
  [27, 29], [29, 31], // left foot
  [28, 30], [30, 32], // right foot
];

const EXERCISE_LANDMARKS = new Set([11, 12, 23, 24, 25, 26, 27, 28]);

const JOINT_COLOR = '#00e676';
const BONE_COLOR = 'rgba(0, 230, 118, 0.5)';
const LOW_VIS_COLOR = 'rgba(255, 82, 82, 0.4)';
const MIN_VIS = 0.5;

export class Overlay {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  draw(landmarks: NormalizedLandmark[]): void {
    const rect = this.canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    this.ctx.clearRect(0, 0, w, h);

    if (!landmarks || landmarks.length === 0) return;

    const toX = (lm: NormalizedLandmark) => (1 - lm.x) * w; // mirror
    const toY = (lm: NormalizedLandmark) => lm.y * h;

    this.ctx.lineWidth = 2;
    for (const [i, j] of POSE_CONNECTIONS) {
      const a = landmarks[i];
      const b = landmarks[j];
      if (!a || !b) continue;

      const vis = Math.min(a.visibility ?? 0, b.visibility ?? 0);
      this.ctx.strokeStyle = vis >= MIN_VIS ? BONE_COLOR : LOW_VIS_COLOR;
      this.ctx.beginPath();
      this.ctx.moveTo(toX(a), toY(a));
      this.ctx.lineTo(toX(b), toY(b));
      this.ctx.stroke();
    }

    for (let i = 0; i < landmarks.length; i++) {
      const lm = landmarks[i];
      if (!lm) continue;

      const isExercise = EXERCISE_LANDMARKS.has(i);
      const vis = lm.visibility ?? 0;
      const radius = isExercise ? 5 : 3;
      const color = vis >= MIN_VIS ? JOINT_COLOR : LOW_VIS_COLOR;

      this.ctx.fillStyle = color;
      this.ctx.beginPath();
      this.ctx.arc(toX(lm), toY(lm), radius, 0, 2 * Math.PI);
      this.ctx.fill();
    }
  }

  clear(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.ctx.clearRect(0, 0, rect.width, rect.height);
  }
}
