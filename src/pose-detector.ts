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
    this.landmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: MODEL_URL,
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numPoses: 1,
    });

    onProgress?.('Warming up…');
    await this.warmup();
  }

  detect(video: HTMLVideoElement, timestamp: number): PoseLandmarkerResult | null {
    if (!this.landmarker) return null;
    return this.landmarker.detectForVideo(video, timestamp);
  }

  private async warmup(): Promise<void> {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 64, 64);

    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;

    const stream = canvas.captureStream(1);
    video.srcObject = stream;
    await video.play();

    for (let i = 0; i < 3; i++) {
      this.landmarker?.detectForVideo(video, performance.now() + i);
    }

    video.pause();
    video.srcObject = null;
    stream.getTracks().forEach((t) => t.stop());
  }

  destroy(): void {
    this.landmarker?.close();
    this.landmarker = null;
  }
}

export type { PoseLandmarkerResult };
