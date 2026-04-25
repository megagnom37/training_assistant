export interface CameraOptions {
  facingMode: 'user' | 'environment';
  width: number;
  height: number;
}

const DEFAULT_OPTIONS: CameraOptions = {
  facingMode: 'user',
  width: 640,
  height: 480,
};

export class Camera {
  private stream: MediaStream | null = null;
  private videoEl: HTMLVideoElement;
  private options: CameraOptions;
  private onVisibilityChange: (() => void) | null = null;

  constructor(videoEl: HTMLVideoElement, options?: Partial<CameraOptions>) {
    this.videoEl = videoEl;
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  async start(): Promise<HTMLVideoElement> {
    const constraints: MediaStreamConstraints = {
      video: {
        facingMode: this.options.facingMode,
        width: { ideal: this.options.width },
        height: { ideal: this.options.height },
      },
      audio: false,
    };

    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    this.videoEl.srcObject = this.stream;

    await new Promise<void>((resolve) => {
      this.videoEl.onloadedmetadata = () => {
        this.videoEl.play();
        resolve();
      };
    });

    this.setupVisibilityHandler();
    return this.videoEl;
  }

  stop(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    this.videoEl.srcObject = null;
    this.teardownVisibilityHandler();
  }

  get width(): number {
    return this.videoEl.videoWidth;
  }

  get height(): number {
    return this.videoEl.videoHeight;
  }

  get ready(): boolean {
    return this.videoEl.readyState >= 2;
  }

  private setupVisibilityHandler(): void {
    this.onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !this.stream) {
        this.start().catch(console.error);
      }
    };
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  private teardownVisibilityHandler(): void {
    if (this.onVisibilityChange) {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
      this.onVisibilityChange = null;
    }
  }
}
