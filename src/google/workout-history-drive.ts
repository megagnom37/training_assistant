import { getStoredProfile, getValidAccessToken } from './auth';

/** Single JSON file on the user's Drive (created by this app; `drive.file` scope). */
export const WORKOUT_HISTORY_FILENAME = 'training-assistant-history.json';

const LS_FILE_ID = 'ta_drive_history_file_id';

const EMPTY_LOG: WorkoutHistoryFile = { version: 1, workouts: [] };

export interface WorkoutHistoryEntry {
  createdAt: string;
}

export interface WorkoutHistoryFile {
  version: 1;
  workouts: WorkoutHistoryEntry[];
}

function parseHistory(raw: string): WorkoutHistoryFile {
  try {
    const data = JSON.parse(raw) as Partial<WorkoutHistoryFile>;
    if (data.version !== 1 || !Array.isArray(data.workouts)) return { ...EMPTY_LOG };
    return {
      version: 1,
      workouts: data.workouts.filter(
        (w): w is WorkoutHistoryEntry =>
          typeof w === 'object' &&
          w !== null &&
          typeof (w as WorkoutHistoryEntry).createdAt === 'string'
      ),
    };
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

/** Pretty-printed JSON for the History screen. */
export async function loadHistoryJsonForDisplay(): Promise<string> {
  if (!getStoredProfile()) {
    throw new Error('Not signed in');
  }
  const token = await getValidAccessToken(false);
  const fileId = await ensureWorkoutHistoryFile(token);
  const raw = await fetchWorkoutHistoryRaw(token, fileId);
  return JSON.stringify(parseHistory(raw), null, 2);
}

/** Append a workout row with only `createdAt` (ISO datetime). */
export async function appendWorkoutSavedAtNow(): Promise<void> {
  const token = await getValidAccessToken(true);
  const fileId = await ensureWorkoutHistoryFile(token);
  const raw = await fetchWorkoutHistoryRaw(token, fileId);
  const data = parseHistory(raw);
  data.workouts.push({ createdAt: new Date().toISOString() });
  await uploadWorkoutHistory(token, fileId, JSON.stringify(data, null, 2));
}
