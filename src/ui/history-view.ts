import type { ChallengeStatus } from '../challenge-tracker';
import type {
  WorkoutHistoryEntry,
  WorkoutHistoryEntryChallenge,
  WorkoutHistoryEntryFree,
  WorkoutHistoryFile,
} from '../google/workout-history-drive';

const RESULT_LABELS: Record<ChallengeStatus, string> = {
  success: 'Completed',
  failed: 'Failed',
  cancelled: 'Canceled',
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function startOfMondayWeek(d: Date): Date {
  const x = startOfDay(d);
  const dow = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - dow);
  return x;
}

/**
 * Two full calendar months in local time: 1st day of previous month through last day of current month.
 * The trailing month is always the current month (not clipped to “today”).
 */
function calendarTwoFullMonthsRange(now = new Date()): { rangeStart: Date; rangeEnd: Date } {
  const y = now.getFullYear();
  const m = now.getMonth();
  const rangeStart = startOfDay(new Date(y, m - 1, 1));
  const rangeEnd = startOfDay(new Date(y, m + 1, 0));
  return { rangeStart, rangeEnd };
}

function dateKeyLocal(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function countWorkoutsByDay(workouts: readonly WorkoutHistoryEntry[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const w of workouts) {
    const t = new Date(w.createdAt);
    if (Number.isNaN(t.getTime())) continue;
    const k = dateKeyLocal(t);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

function formatDurationText(totalSeconds: number): string {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const mm = Math.floor(sec / 60);
  const ss = sec % 60;
  return `${mm}m ${pad2(ss)}s`;
}

function formatRpm(rpm: number | null): string {
  if (rpm === null || !Number.isFinite(rpm) || rpm <= 0) return '—';
  const rounded = rpm >= 100 ? Math.round(rpm) : Math.round(rpm * 10) / 10;
  return `${rounded} rpm`;
}

function formatRpmChallenge(rpm: number): string {
  if (!Number.isFinite(rpm) || rpm <= 0) return '—';
  const rounded = rpm >= 100 ? Math.round(rpm) : Math.round(rpm * 10) / 10;
  return `${rounded} rpm`;
}

function formatSessionDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const datePart = d
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    .toUpperCase()
    .replace(',', '');
  const timePart = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${datePart} · ${timePart}`;
}

function isFullEntry(w: WorkoutHistoryEntry): w is WorkoutHistoryEntryFree | WorkoutHistoryEntryChallenge {
  return 'mode' in w && (w.mode === 'free' || w.mode === 'challenge');
}

function buildActivityCalendar(workouts: readonly WorkoutHistoryEntry[]): HTMLElement {
  const { rangeStart, rangeEnd } = calendarTwoFullMonthsRange();
  const counts = countWorkoutsByDay(workouts);

  const gridMonday = startOfMondayWeek(rangeStart);
  const lastMonday = startOfMondayWeek(rangeEnd);
  const numWeeks = Math.max(
    1,
    Math.floor((lastMonday.getTime() - gridMonday.getTime()) / (7 * 86400000)) + 1
  );

  const wrap = document.createElement('section');
  wrap.className = 'history-calendar-card';

  const head = document.createElement('div');
  head.className = 'history-calendar-head';
  head.innerHTML = `
    <span class="history-calendar-title">Activity Calendar</span>
    <span class="history-calendar-range-badge">2 Months</span>
  `;

  const synced = document.createElement('div');
  synced.className = 'history-cal-synced';

  const monthRow = document.createElement('div');
  monthRow.className = 'history-cal-month-row';
  const monthSpacer = document.createElement('div');
  monthSpacer.className = 'history-cal-month-spacer';
  monthRow.appendChild(monthSpacer);
  const monthTrack = document.createElement('div');
  monthTrack.className = 'history-cal-month-track';
  monthTrack.style.gridTemplateColumns = `repeat(${numWeeks}, minmax(0, 1fr))`;

  for (let wi = 0; wi < numWeeks; wi++) {
    const wm = addDays(gridMonday, wi * 7);
    const prev = wi > 0 ? addDays(gridMonday, (wi - 1) * 7) : null;
    const cell = document.createElement('div');
    cell.className = 'history-cal-month-cell';
    if (wi === 0 || (prev && wm.getMonth() !== prev.getMonth())) {
      cell.textContent = wm.toLocaleString('en-US', { month: 'short' }).toUpperCase();
    }
    monthTrack.appendChild(cell);
  }
  monthRow.appendChild(monthTrack);

  const gridOuter = document.createElement('div');
  gridOuter.className = 'history-cal-grid-outer';

  const dowCol = document.createElement('div');
  dowCol.className = 'history-cal-dow-col';
  const positions = ['M', '', 'W', '', 'F', '', 'S'];
  for (const lab of positions) {
    const s = document.createElement('span');
    s.className = 'history-cal-dow';
    s.textContent = lab;
    dowCol.appendChild(s);
  }

  const colsWrap = document.createElement('div');
  colsWrap.className = 'history-cal-columns';

  for (let wi = 0; wi < numWeeks; wi++) {
    const weekMonday = addDays(gridMonday, wi * 7);
    const col = document.createElement('div');
    col.className = 'history-cal-column';

    for (let row = 0; row < 7; row++) {
      const cellDate = addDays(weekMonday, row);
      const sq = document.createElement('div');
      sq.className = 'history-cal-cell';

      if (cellDate < rangeStart || cellDate > rangeEnd) {
        sq.classList.add('history-cal-cell--out');
      } else {
        const c = counts.get(dateKeyLocal(cellDate)) ?? 0;
        if (c <= 0) sq.classList.add('history-cal-cell--0');
        else if (c === 1) sq.classList.add('history-cal-cell--1');
        else sq.classList.add('history-cal-cell--2');
        sq.title = `${dateKeyLocal(cellDate)}: ${c} workout${c === 1 ? '' : 's'}`;
      }
      col.appendChild(sq);
    }
    colsWrap.appendChild(col);
  }

  gridOuter.appendChild(dowCol);
  gridOuter.appendChild(colsWrap);

  synced.appendChild(monthRow);
  synced.appendChild(gridOuter);

  const legend = document.createElement('div');
  legend.className = 'history-cal-legend';
  legend.innerHTML = `
    <span class="history-cal-legend-text">Less</span>
    <div class="history-cal-legend-swatches">
      <span class="history-cal-swatch history-cal-swatch--0"></span>
      <span class="history-cal-swatch history-cal-swatch--1"></span>
      <span class="history-cal-swatch history-cal-swatch--2"></span>
    </div>
    <span class="history-cal-legend-text">More</span>
  `;

  wrap.appendChild(head);
  wrap.appendChild(synced);
  wrap.appendChild(legend);

  return wrap;
}

function buildFreeDetails(w: WorkoutHistoryEntryFree): HTMLElement {
  const grid = document.createElement('div');
  grid.className = 'history-exp-details history-exp-details--free';
  grid.innerHTML = `
    <div class="history-stat">
      <span class="history-stat-label">Duration</span>
      <span class="history-stat-value">${formatDurationText(w.durationSeconds)}</span>
    </div>
    <div class="history-stat">
      <span class="history-stat-label">Total Reps</span>
      <span class="history-stat-value">${w.totalReps}</span>
    </div>
    <div class="history-stat">
      <span class="history-stat-label">Avg Rate</span>
      <span class="history-stat-value">${formatRpm(w.avgRateRpm)}</span>
    </div>
  `;
  return grid;
}

function buildChallengeDetails(w: WorkoutHistoryEntryChallenge): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'history-exp-details history-exp-details--challenge';

  const row1 = document.createElement('div');
  row1.className = 'history-exp-row';
  row1.innerHTML = `
    <div class="history-stat">
      <span class="history-stat-label">Result</span>
      <span class="history-stat-value history-stat-value--accent">${RESULT_LABELS[w.result]}</span>
    </div>
    <div class="history-stat">
      <span class="history-stat-label">Target Time</span>
      <span class="history-stat-value">${formatDurationText(w.targetTimeSeconds)}</span>
    </div>
    <div class="history-stat">
      <span class="history-stat-label">Elapsed Time</span>
      <span class="history-stat-value">${formatDurationText(Math.floor(w.elapsedSeconds))}</span>
    </div>
  `;

  const row2 = document.createElement('div');
  row2.className = 'history-exp-row history-exp-row--border';
  row2.innerHTML = `
    <div class="history-stat">
      <span class="history-stat-label">Target Reps</span>
      <span class="history-stat-value">${w.targetReps}</span>
    </div>
    <div class="history-stat">
      <span class="history-stat-label">Done Reps</span>
      <span class="history-stat-value">${w.doneReps}</span>
    </div>
    <div class="history-stat">
      <span class="history-stat-label">Avg Rate</span>
      <span class="history-stat-value">${formatRpmChallenge(w.avgRateRpm)}</span>
    </div>
  `;

  wrap.appendChild(row1);
  wrap.appendChild(row2);
  return wrap;
}

function buildWorkoutCard(w: WorkoutHistoryEntry): HTMLElement {
  const card = document.createElement('article');
  card.className = 'history-workout-card';

  const headBtn = document.createElement('button');
  headBtn.type = 'button';
  headBtn.className = 'history-workout-head';

  const modeShort = isFullEntry(w) ? (w.mode === 'free' ? 'Free' : 'Challenge') : null;
  const exerciseName = isFullEntry(w) ? w.exerciseName : 'Workout';

  headBtn.innerHTML = `
    <div class="history-workout-head-main">
      <span class="history-workout-date">${formatSessionDateTime(w.createdAt)}</span>
      <span class="history-workout-name">${escapeHtml(exerciseName)}</span>
      <span class="history-workout-mode">${modeShort ? `(${escapeHtml(modeShort)})` : ''}</span>
    </div>
    <span class="history-workout-chevron" aria-hidden="true"></span>
  `;

  const body = document.createElement('div');
  body.className = 'history-workout-body hidden';

  if ('mode' in w && w.mode === 'free') {
    body.appendChild(buildFreeDetails(w));
  } else if ('mode' in w && w.mode === 'challenge') {
    body.appendChild(buildChallengeDetails(w));
  } else {
    body.innerHTML = `<p class="history-workout-legacy">Подробности недоступны для этой записи.</p>`;
  }

  const expandable = isFullEntry(w);
  if (!expandable) {
    headBtn.classList.add('history-workout-head--static');
    headBtn.disabled = true;
    headBtn.querySelector('.history-workout-chevron')?.remove();
  }

  headBtn.addEventListener('click', () => {
    if (!expandable) return;
    body.classList.toggle('hidden');
    const expanded = !body.classList.contains('hidden');
    headBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    headBtn.classList.toggle('history-workout-head--open', expanded);
  });

  if (expandable) {
    headBtn.setAttribute('aria-expanded', 'false');
  }

  card.appendChild(headBtn);
  card.appendChild(body);

  return card;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderHistoryView(root: HTMLElement, data: WorkoutHistoryFile): void {
  root.replaceChildren();
  root.classList.remove('hidden');

  const title = document.createElement('h2');
  title.className = 'history-page-title';
  title.textContent = 'History';

  root.appendChild(title);
  root.appendChild(buildActivityCalendar(data.workouts));

  const list = document.createElement('div');
  list.className = 'history-workout-list';

  const sorted = [...data.workouts].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  if (sorted.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'history-empty-list';
    empty.textContent = 'Пока нет сохранённых тренировок.';
    list.appendChild(empty);
  } else {
    for (const w of sorted) {
      list.appendChild(buildWorkoutCard(w));
    }
  }

  root.appendChild(list);
}
