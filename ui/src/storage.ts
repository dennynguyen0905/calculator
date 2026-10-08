const STATE_KEY = 'fx580vnx.state.v1';
const PREFS_KEY = 'fx580vnx.prefs.v1';

export interface Prefs {
  theme: 'dark' | 'light';
  sound: boolean;
}

export const defaultPrefs: Prefs = { theme: 'dark', sound: false };

export function loadState(): unknown | null {
  try {
    const s = localStorage.getItem(STATE_KEY);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

export function saveState(state: unknown): void {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable or full: ignore */
  }
}

export function clearState(): void {
  try {
    localStorage.removeItem(STATE_KEY);
  } catch {
    /* ignore */
  }
}

export function loadPrefs(): Prefs {
  try {
    const s = localStorage.getItem(PREFS_KEY);
    return s ? { ...defaultPrefs, ...(JSON.parse(s) as Partial<Prefs>) } : defaultPrefs;
  } catch {
    return defaultPrefs;
  }
}

export function savePrefs(p: Prefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}
