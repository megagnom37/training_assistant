import type { ChallengeStatus } from '../challenge-tracker';
import { getStoredProfile, getValidAccessToken } from './auth';

/** Single JSON file on the user's Drive (created by this app; `drive.file` scope). */
export const WORKOUT_HISTORY_FILENAME = 'training-assistant-history.json';

const LS_FILE_ID = 'ta_drive_history_file_id';

const EMPTY_LOG: WorkoutHistoryFile = { version: 1, workouts: [] };

/** Older rows contained only a timestamp. */
export interface WorkoutHistoryEntryLegacy {
  createdAt: string;
}

export interface WorkoutHistoryEntryFree {
  createdAt: string;
  mode: 'free';
  exerciseName: string;
  durationSeconds: number;
  totalReps: number;
  avgRateRpm: number | null;
}

export interface WorkoutHistoryEntryChallenge {
  createdAt: string;
  mode: 'challenge';
  exerciseName: string;
  result: ChallengeStatus;
  targetTimeSeconds: number;
  elapsedSeconds: number;
  targetReps: number;
  doneReps: number;
  avgRateRpm: number;
}

export type WorkoutHistoryEntry =
  | WorkoutHistoryEntryFree
  | WorkoutHistoryEntryChallenge
  | WorkoutHistoryEntryLegacy;

export type WorkoutHistoryNewEntry = WorkoutHistoryEntryFree | WorkoutHistoryEntryChallenge;

export interface WorkoutHistoryFile {
  version: 1;
  workouts: WorkoutHistoryEntry[];
}

function isChallengeStatus(v: unknown): v is ChallengeStatus {
  return v === 'success' || v === 'failed' || v === 'cancelled';
}

function normalizeWorkout(w: unknown): WorkoutHistoryEntry | null {
  if (!w || typeof w !== 'object') return null;
  const o = w as Record<string, unknown>;
  if (typeof o.createdAt !== 'string') return null;

  if (o.mode === 'free') {
    if (typeof o.exerciseName !== 'string') return { createdAt: o.createdAt };
    const durationSeconds = Number(o.durationSeconds);
    const totalReps = Number(o.totalReps);
    let avgRateRpm: number | null = null;
    if (o.avgRateRpm === null) avgRateRpm = null;
    else if (typeof o.avgRateRpm === 'number' && Number.isFinite(o.avgRateRpm)) avgRateRpm = o.avgRateRpm;
    else if (typeof o.avgRateRpm === 'string' && o.avgRateRpm !== '') {
      const n = Number(o.avgRateRpm);
      if (Number.isFinite(n)) avgRateRpm = n;
    }
    if (!Number.isFinite(durationSeconds) || !Number.isFinite(totalReps)) return { createdAt: o.createdAt };
    return {
      createdAt: o.createdAt,
      mode: 'free',
      exerciseName: o.exerciseName,
      durationSeconds: Math.max(0, Math.floor(durationSeconds)),
      totalReps: Math.max(0, Math.floor(totalReps)),
      avgRateRpm,
    };
  }

  if (o.mode === 'challenge') {
    if (typeof o.exerciseName !== 'string' || !isChallengeStatus(o.result)) {
      return { createdAt: o.createdAt };
    }
    const targetTimeSeconds = Number(o.targetTimeSeconds);
    const elapsedSeconds = Number(o.elapsedSeconds);
    const targetReps = Number(o.targetReps);
    const doneReps = Number(o.doneReps);
    const avgRateRpm = Number(o.avgRateRpm);
    if (
      !Number.isFinite(targetTimeSeconds) ||
      !Number.isFinite(elapsedSeconds) ||
      !Number.isFinite(targetReps) ||
      !Number.isFinite(doneReps) ||
      !Number.isFinite(avgRateRpm)
    ) {
      return { createdAt: o.createdAt };
    }
    return {
      createdAt: o.createdAt,
      mode: 'challenge',
      exerciseName: o.exerciseName,
      result: o.result,
      targetTimeSeconds,
      elapsedSeconds,
      targetReps: Math.floor(targetReps),
      doneReps: Math.floor(doneReps),
      avgRateRpm,
    };
  }

  return { createdAt: o.createdAt };
}

export function parseHistory(raw: string): WorkoutHistoryFile {
  try {
    const data = JSON.parse(raw) as Partial<WorkoutHistoryFile>;
    if (data.version !== 1 || !Array.isArray(data.workouts)) return { ...EMPTY_LOG };
    const workouts: WorkoutHistoryEntry[] = [];
    for (const w of data.workouts) {
      const n = normalizeWorkout(w);
      if (n) workouts.push(n);
    }
    return { version: 1, workouts };
  } catch {
    return { ...EMPTY_LOG };
  }
}

async function findHistoryFileId(token: string): Promise<string | null> {
  const q = `name='${WORKOUT_HISTORY_FILENAME}' and mimeType='application/json' and trashed=false`;
  const url =
    'https://www.googleapis.com/drive/v3/files?' +
    new URLSearchParams({
      q,
      spaces: 'drive',
      fields: 'files(id,name)',
      pageSize: '5',
    }).toString();

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    throw new Error(`Drive list failed (${res.status}).`);
  }
  const data = (await res.json()) as { files?: { id: string }[] };
  const id = data.files?.[0]?.id;
  return id ?? null;
}

function buildMultipartRelated(metadata: Record<string, unknown>, mediaBody: string): {
  body: Blob;
  contentType: string;
} {
  const b = `ta_drive_${Math.random().toString(36).slice(2, 11)}`;
  const text = [
    `--${b}\r\n`,
    'Content-Type: application/json; charset=UTF-8\r\n',
    '\r\n',
    JSON.stringify(metadata),
    `\r\n--${b}\r\n`,
    'Content-Type: application/json\r\n',
    '\r\n',
    mediaBody,
    `\r\n--${b}--`,
  ].join('');
  return {
    body: new Blob([text]),
    contentType: `multipart/related; boundary=${b}`,
  };
}

async function createHistoryFile(token: string): Promise<string> {
  const metadata = {
    name: WORKOUT_HISTORY_FILENAME,
    mimeType: 'application/json',
  };
  const bodyText = JSON.stringify(EMPTY_LOG, null, 2);
  const { body, contentType } = buildMultipartRelated(metadata, bodyText);

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': contentType,
    },
    body,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Could not create history file (${res.status}): ${errText.slice(0, 200)}`);
  }

  const created = (await res.json()) as { id?: string };
  if (!created.id) throw new Error('Drive did not return file id.');
  return created.id;
}

/** Resolve file id (cache → Drive search → create empty file). */
export async function ensureWorkoutHistoryFile(token: string): Promise<string> {
  const cached = localStorage.getItem(LS_FILE_ID);
  if (cached) return cached;

  const existing = await findHistoryFileId(token);
  if (existing) {
    localStorage.setItem(LS_FILE_ID, existing);
    return existing;
  }

  const id = await createHistoryFile(token);
  localStorage.setItem(LS_FILE_ID, id);
  return id;
}

export async function fetchWorkoutHistoryRaw(token: string, fileId: string): Promise<string> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Could not download history (${res.status}).`);
  }
  return res.text();
}

async function uploadWorkoutHistory(token: string, fileId: string, jsonText: string): Promise<void> {
  const res = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: jsonText,
    }
  );
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Could not save history (${res.status}): ${errText.slice(0, 200)}`);
  }
}

/** After first successful login: ensure empty JSON file exists on Drive. */
export async function ensureEmptyHistoryIfNeeded(token: string): Promise<void> {
  await ensureWorkoutHistoryFile(token);
}

/** Parsed workout log for the History screen UI. */
export async function loadWorkoutHistory(): Promise<WorkoutHistoryFile> {
  if (!getStoredProfile()) {
    throw new Error('Not signed in');
  }
  const token = await getValidAccessToken(false);
  const fileId = await ensureWorkoutHistoryFile(token);
  const raw = await fetchWorkoutHistoryRaw(token, fileId);
  return parseHistory(raw);
}

/** Append a full workout row (saved JSON matches expanded UI fields). */
export async function appendWorkout(entry: WorkoutHistoryNewEntry): Promise<void> {
  const token = await getValidAccessToken(true);
  const fileId = await ensureWorkoutHistoryFile(token);
  const raw = await fetchWorkoutHistoryRaw(token, fileId);
  const data = parseHistory(raw);
  data.workouts.push(entry);
  await uploadWorkoutHistory(token, fileId, JSON.stringify(data, null, 2));
}
