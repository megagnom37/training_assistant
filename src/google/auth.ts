/** Google OAuth scopes: profile + narrow Drive (files created by this app only). */
export const GOOGLE_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/drive.file',
].join(' ');

const LS_AT = 'ta_google_access_token';
const LS_EXP = 'ta_google_access_expires_at';
const LS_PROFILE = 'ta_google_profile';

export interface GoogleUserProfile {
  name: string;
  email: string;
  picture?: string;
}

export interface TokenCallbackResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

export function getGoogleClientId(): string {
  return (import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '').trim();
}

export function isGoogleAuthConfigured(): boolean {
  return getGoogleClientId().length > 0;
}

export function loadGoogleIdentityScript(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener(
        'error',
        () => reject(new Error('Failed to load Google Identity Services')),
        { once: true }
      );
      return;
    }

    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(s);
  });
}

let pendingToken: {
  resolve: (r: TokenCallbackResponse) => void;
  reject: (e: Error) => void;
} | null = null;

let tokenClient: {
  requestAccessToken: (overrideConfig?: { prompt?: '' | 'none' | 'consent' | 'select_account' }) => void;
} | null = null;

function ensureTokenClient(): void {
  const clientId = getGoogleClientId();
  if (!clientId) throw new Error('Google Client ID is not configured (VITE_GOOGLE_CLIENT_ID).');

  const g = window.google?.accounts?.oauth2;
  if (!g) throw new Error('Google Identity Services is not loaded.');

  if (!tokenClient) {
    tokenClient = g.initTokenClient({
      client_id: clientId,
      scope: GOOGLE_SCOPES,
      callback: (resp: TokenCallbackResponse) => {
        if (!pendingToken) return;
        const p = pendingToken;
        pendingToken = null;
        if (resp.error) {
          p.reject(new Error(resp.error_description ?? resp.error));
          return;
        }
        p.resolve(resp);
      },
    });
  }
}

function requestTokenResponse(prompt?: '' | 'none' | 'consent' | 'select_account'): Promise<TokenCallbackResponse> {
  ensureTokenClient();
  return new Promise((resolve, reject) => {
    pendingToken = { resolve, reject };
    try {
      tokenClient!.requestAccessToken(prompt !== undefined ? { prompt } : {});
    } catch (e) {
      pendingToken = null;
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

function storeToken(resp: TokenCallbackResponse): string {
  const at = resp.access_token;
  if (!at) throw new Error('No access token returned.');
  const expSec = resp.expires_in ?? 3600;
  const expiresAt = Date.now() + Math.max(60, expSec - 30) * 1000;
  localStorage.setItem(LS_AT, at);
  localStorage.setItem(LS_EXP, String(expiresAt));
  return at;
}

/** Obtain a usable access token; uses silent refresh when possible. */
export async function getValidAccessToken(interactive: boolean): Promise<string> {
  if (!isGoogleAuthConfigured()) {
    throw new Error('Google sign-in is not configured.');
  }

  await loadGoogleIdentityScript();

  const exp = Number(localStorage.getItem(LS_EXP) ?? '0');
  const at = localStorage.getItem(LS_AT);
  const slack = 120_000;

  if (at && exp > Date.now() + slack) {
    return at;
  }

  if (!interactive) {
    try {
      const silent = await requestTokenResponse('');
      return storeToken(silent);
    } catch {
      throw new Error('Not signed in');
    }
  }

  const resp = await requestTokenResponse();
  return storeToken(resp);
}

export async function signInWithGoogle(): Promise<void> {
  await loadGoogleIdentityScript();
  const resp = await requestTokenResponse();
  const token = storeToken(resp);
  await fetchAndStoreUserProfile(token);
}

export async function fetchAndStoreUserProfile(accessToken: string): Promise<GoogleUserProfile> {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Failed to load Google profile (${res.status}).`);
  }
  const data = (await res.json()) as { name?: string; email?: string; picture?: string };
  const profile: GoogleUserProfile = {
    name: data.name ?? '',
    email: data.email ?? '',
    picture: data.picture,
  };
  localStorage.setItem(LS_PROFILE, JSON.stringify(profile));
  return profile;
}

export function getStoredProfile(): GoogleUserProfile | null {
  const raw = localStorage.getItem(LS_PROFILE);
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as GoogleUserProfile;
    if (typeof p.email !== 'string') return null;
    return p;
  } catch {
    return null;
  }
}

export function hasGoogleSessionHint(): boolean {
  return Boolean(localStorage.getItem(LS_AT) && getStoredProfile());
}

export async function signOutGoogle(): Promise<void> {
  const token = localStorage.getItem(LS_AT);
  localStorage.removeItem(LS_AT);
  localStorage.removeItem(LS_EXP);
  localStorage.removeItem(LS_PROFILE);
  localStorage.removeItem('ta_drive_history_file_id');

  if (!token) return;

  try {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
  } catch {
    /* ignore network revoke failures */
  }
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (resp: TokenCallbackResponse) => void;
          }) => {
            requestAccessToken: (overrideConfig?: {
              prompt?: '' | 'none' | 'consent' | 'select_account';
            }) => void;
          };
        };
      };
    };
  }
}
