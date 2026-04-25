import {
  PoseLandmarker,
  FilesetResolver,
  type PoseLandmarkerResult,
} from '@mediapipe/tasks-vision';

const WASM_CDN =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

export class PoseDetector {
  private landmarker: PoseLandmarker | null = null;

  async init(onProgress?: (msg: string) => void): Promise<void> {
    onProgress?.('Loading vision runtime…');
    const vision = await FilesetResolver.forVisionTasks(WASM_CDN);

    onProgress?.('Loading pose model…');
    this.landmarker = await this.createLandmarker(vision);

    onProgress?.('Warming up…');
    this.warmup();
  }

  detect(video: HTMLVideoElement, timestamp: number): PoseLandmarkerResult | null {
    if (!this.landmarker) return null;
    return this.landmarker.detectForVideo(video, timestamp);
  }

  private async createLandmarker(vision: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>): Promise<PoseLandmarker> {
    const options = (delegate: 'GPU' | 'CPU') => ({
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: 'VIDEO' as const,
      numPoses: 1,
    });

    try {
      return await PoseLandmarker.createFromOptions(vision, options('GPU'));
    } catch {
      return await PoseLandmarker.createFromOptions(vision, options('CPU'));
    }
  }

  private warmup(): void {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 64, 64);

    for (let i = 0; i < 3; i++) {
      this.landmarker?.detectForVideo(canvas, performance.now() + i);
    }
  }

  destroy(): void {
    this.landmarker?.close();
    this.landmarker = null;
  }
}

export type { PoseLandmarkerResult };
