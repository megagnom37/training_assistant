export class Controls {
  private btnStart: HTMLButtonElement;
  private btnStartLabel: HTMLElement | null;
  private btnStartIcon: HTMLElement | null;
  private _active = false;
  private onToggle: ((active: boolean) => void) | null = null;

  constructor() {
    this.btnStart = document.getElementById('btn-start') as HTMLButtonElement;
    this.btnStartLabel = document.getElementById('btn-start-label');
    this.btnStartIcon = document.getElementById('btn-start-icon');
    this.btnStart.addEventListener('click', () => this.toggle());
  }

  set onSessionToggle(cb: (active: boolean) => void) {
    this.onToggle = cb;
  }

  toggle(): void {
    this._active = !this._active;
    this.syncUI();
    this.onToggle?.(this._active);
  }

  setActive(active: boolean): void {
    this._active = active;
    this.syncUI();
  }

  get active(): boolean {
    return this._active;
  }

  private syncUI(): void {
    const nextLabel = this._active ? 'STOP' : 'START';
    if (this.btnStartLabel) {
      this.btnStartLabel.textContent = nextLabel;
    } else {
      // Fallback (shouldn't happen): keep button usable.
      this.btnStart.textContent = nextLabel;
    }
    if (this.btnStartIcon) {
      this.btnStartIcon.textContent = this._active ? '■' : '▶';
    }
    this.btnStart.classList.toggle('active', this._active);
  }
}
