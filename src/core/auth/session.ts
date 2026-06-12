export type AuthMode = 'api' | 'demo';

const TOKEN_KEY = 'FinSync_AuthToken';
const AUTH_MODE_KEY = 'FinSync_AuthMode';
const CURRENT_USER_KEY = 'FinSync_CurrentUser';

export function getAccessToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getAuthMode(): AuthMode | null {
  const mode = localStorage.getItem(AUTH_MODE_KEY);
  return mode === 'api' || mode === 'demo' ? mode : null;
}

export function setAuthSession(params: { token: string | null; mode: AuthMode; userId: string }) {
  if (params.token) {
    localStorage.setItem(TOKEN_KEY, params.token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
  localStorage.setItem(AUTH_MODE_KEY, params.mode);
  localStorage.setItem(CURRENT_USER_KEY, params.userId);
}

export function clearAuthSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(AUTH_MODE_KEY);
  localStorage.removeItem(CURRENT_USER_KEY);
}

export function getAuthHeaders(): Record<string, string> {
  const token = getAccessToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

export function isApiAuthEnabled(): boolean {
  return getAuthMode() === 'api' && Boolean(getAccessToken());
}
