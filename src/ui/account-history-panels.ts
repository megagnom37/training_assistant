import {
  getValidAccessToken,
  getStoredProfile,
  hasGoogleSessionHint,
  isGoogleAuthConfigured,
  signInWithGoogle,
  signOutGoogle,
} from '../google/auth';
import { ensureEmptyHistoryIfNeeded, loadHistoryJsonForDisplay } from '../google/workout-history-drive';

export class AccountHistoryPanels {
  private openPanel: null | 'history' | 'account' = null;

  private readonly panelHistory: HTMLElement;
  private readonly panelAccount: HTMLElement;
  private readonly historyPre: HTMLElement;
  private readonly historyHint: HTMLElement;
  private readonly accountSignedOut: HTMLElement;
  private readonly accountSignedIn: HTMLElement;
  private readonly accountNameEl: HTMLElement;
  private readonly accountEmailEl: HTMLElement;
  private readonly accountMissingConfig: HTMLElement;
  private readonly btnSignIn: HTMLButtonElement;
  private readonly btnSignOut: HTMLButtonElement;
  private readonly navHistory: HTMLButtonElement;
  private readonly navAccount: HTMLButtonElement;
  private readonly navWorkout: HTMLButtonElement;

  constructor() {
    this.panelHistory = document.getElementById('panel-history')!;
    this.panelAccount = document.getElementById('panel-account')!;
    this.historyPre = document.getElementById('history-json-raw')!;
    this.historyHint = document.getElementById('history-json-hint')!;
    this.accountSignedOut = document.getElementById('account-signed-out')!;
    this.accountSignedIn = document.getElementById('account-signed-in')!;
    this.accountNameEl = document.getElementById('account-display-name')!;
    this.accountEmailEl = document.getElementById('account-display-email')!;
    this.accountMissingConfig = document.getElementById('account-missing-config')!;
    this.btnSignIn = document.getElementById('btn-google-sign-in') as HTMLButtonElement;
    this.btnSignOut = document.getElementById('btn-google-sign-out') as HTMLButtonElement;
    this.navHistory = document.getElementById('nav-history') as HTMLButtonElement;
    this.navAccount = document.getElementById('nav-account') as HTMLButtonElement;
    this.navWorkout = document.getElementById('nav-workout') as HTMLButtonElement;

    document.getElementById('btn-panel-history-close')!.addEventListener('click', () => this.close());
    document.getElementById('btn-panel-account-close')!.addEventListener('click', () => this.close());

    this.btnSignIn.addEventListener('click', () => void this.handleSignIn());
    this.btnSignOut.addEventListener('click', () => void this.handleSignOut());

    this.navHistory.addEventListener('click', () => void this.openHistory());
    this.navAccount.addEventListener('click', () => this.openAccount());
  }

  isOpen(): boolean {
    return this.openPanel !== null;
  }

  close(): void {
    this.panelHistory.classList.add('hidden');
    this.panelAccount.classList.add('hidden');
    this.openPanel = null;
    this.setNavActive('workout');
  }

  /** Show Account panel (e.g. before save if needed). */
  openAccount(): void {
    this.panelHistory.classList.add('hidden');
    this.panelAccount.classList.remove('hidden');
    this.openPanel = 'account';
    this.refreshAccountUI();
    this.setNavActive('account');
  }

  async openHistory(): Promise<void> {
    this.panelAccount.classList.add('hidden');
    this.panelHistory.classList.remove('hidden');
    this.openPanel = 'history';
    this.setNavActive('history');

    this.historyPre.textContent = '';
    this.historyHint.textContent = 'Loading…';

    if (!isGoogleAuthConfigured()) {
      this.historyHint.textContent =
        'Google is not configured. Set VITE_GOOGLE_CLIENT_ID for this deployment.';
      return;
    }

    try {
      const json = await loadHistoryJsonForDisplay();
      this.historyPre.textContent = json;
      this.historyHint.textContent = '';
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not load history.';
      this.historyHint.textContent =
        msg === 'Not signed in' ? 'Sign in under Account to sync history from Google Drive.' : msg;
    }
  }

  refreshAccountUI(): void {
    const configured = isGoogleAuthConfigured();
    this.accountMissingConfig.classList.toggle('hidden', configured);
    this.btnSignIn.disabled = !configured;

    const profile = getStoredProfile();
    const hint = hasGoogleSessionHint();

    if (hint && profile) {
      this.accountSignedOut.classList.add('hidden');
      this.accountSignedIn.classList.remove('hidden');
      this.accountNameEl.textContent = profile.name || '—';
      this.accountEmailEl.textContent = profile.email || '—';
    } else {
      this.accountSignedIn.classList.add('hidden');
      this.accountSignedOut.classList.remove('hidden');
    }
  }

  setNavActive(tab: 'workout' | 'history' | 'account'): void {
    this.navWorkout.classList.toggle('bottom-nav-item-active', tab === 'workout');
    this.navHistory.classList.toggle('bottom-nav-item-active', tab === 'history');
    this.navAccount.classList.toggle('bottom-nav-item-active', tab === 'account');
  }

  private async handleSignIn(): Promise<void> {
    if (!isGoogleAuthConfigured()) return;

    this.btnSignIn.disabled = true;
    try {
      await signInWithGoogle();
      const token = await getValidAccessToken(false);
      await ensureEmptyHistoryIfNeeded(token);
      this.refreshAccountUI();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Google sign-in failed.');
    } finally {
      this.btnSignIn.disabled = !isGoogleAuthConfigured();
    }
  }

  private async handleSignOut(): Promise<void> {
    this.btnSignOut.disabled = true;
    try {
      await signOutGoogle();
      this.refreshAccountUI();
    } finally {
      this.btnSignOut.disabled = false;
    }
  }
}
