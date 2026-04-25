function smoothingFactor(te: number, cutoff: number): number {
  const r = 2 * Math.PI * cutoff * te;
  return r / (r + 1);
}

function expSmoothing(a: number, x: number, xPrev: number): number {
  return a * x + (1 - a) * xPrev;
}

export class OneEuroFilter {
  private minCutoff: number;
  private beta: number;
  private dCutoff: number;
  private xPrev: number;
  private dxPrev: number;
  private tPrev: number;
  private initialized: boolean;

  constructor(minCutoff = 1.0, beta = 0.007, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.xPrev = 0;
    this.dxPrev = 0;
    this.tPrev = 0;
    this.initialized = false;
  }

  filter(t: number, x: number): number {
    if (!this.initialized) {
      this.xPrev = x;
      this.dxPrev = 0;
      this.tPrev = t;
      this.initialized = true;
      return x;
    }

    const te = t - this.tPrev;
    if (te <= 0) return this.xPrev;

    const ad = smoothingFactor(te, this.dCutoff);
    const dx = (x - this.xPrev) / te;
    const dxHat = expSmoothing(ad, dx, this.dxPrev);

    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
    const a = smoothingFactor(te, cutoff);
    const xHat = expSmoothing(a, x, this.xPrev);

    this.xPrev = xHat;
    this.dxPrev = dxHat;
    this.tPrev = t;
    return xHat;
  }

  reset(): void {
    this.initialized = false;
  }
}
