import type { RepTempo } from '../tempo-tracker';

export class HUD {
  private repCountEl: HTMLElement;
  private timerEl: HTMLElement;
  private tempoDownEl: HTMLElement;
  private tempoPauseEl: HTMLElement;
  private tempoUpEl: HTMLElement;
  private exerciseNameEl: HTMLElement;

  private sessionStart = 0;
  private timerHandle = 0;

  constructor() {
    this.repCountEl = document.getElementById('rep-count')!;
    this.timerEl = document.getElementById('session-timer')!;
    this.tempoDownEl = document.getElementById('tempo-down')!;
    this.tempoPauseEl = document.getElementById('tempo-pause')!;
    this.tempoUpEl = document.getElementById('tempo-up')!;
    this.exerciseNameEl = document.getElementById('exercise-name')!;
  }

  setExerciseName(name: string): void {
    this.exerciseNameEl.textContent = name;
  }

  updateRepCount(count: number): void {
    if (this.repCountEl.textContent !== String(count)) {
      this.repCountEl.textContent = String(count);
      this.repCountEl.classList.add('bump');
      setTimeout(() => this.repCountEl.classList.remove('bump'), 200);
    }
  }

  updateTempo(tempo: RepTempo | null): void {
    if (!tempo) {
      this.tempoDownEl.textContent = '\u25BC --';
      this.tempoPauseEl.textContent = '\u23F8 --';
      this.tempoUpEl.textContent = '\u25B2 --';
      return;
    }
    this.tempoDownEl.textContent = `\u25BC ${tempo.eccentric.toFixed(1)}s`;
    this.tempoPauseEl.textContent = `\u23F8 ${tempo.pause.toFixed(1)}s`;
    this.tempoUpEl.textContent = `\u25B2 ${tempo.concentric.toFixed(1)}s`;
  }

  startTimer(): void {
    this.sessionStart = performance.now();
    this.timerHandle = window.setInterval(() => {
      const elapsed = (performance.now() - this.sessionStart) / 1000;
      const min = Math.floor(elapsed / 60);
      const sec = Math.floor(elapsed % 60);
      this.timerEl.textContent =
        `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    }, 500);
  }

  stopTimer(): void {
    clearInterval(this.timerHandle);
  }

  reset(): void {
    this.stopTimer();
    this.repCountEl.textContent = '0';
    this.timerEl.textContent = '00:00';
    this.updateTempo(null);
  }
}
