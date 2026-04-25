export class Controls {
  private btnStart: HTMLButtonElement;
  private _active = false;
  private onToggle: ((active: boolean) => void) | null = null;

  constructor() {
    this.btnStart = document.getElementById('btn-start') as HTMLButtonElement;
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
    this.btnStart.textContent = this._active ? 'Stop' : 'Start';
    this.btnStart.classList.toggle('active', this._active);
  }
}
