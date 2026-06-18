const TOKEN_KEY = 'FinSync_AuthToken';
const CURRENT_USER_KEY = 'FinSync_CurrentUser';
const EXPIRES_AT_KEY = 'FinSync_AuthExpiresAt';

export function getAccessToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getSessionExpiresAt(): string | null {
  return localStorage.getItem(EXPIRES_AT_KEY);
}

export function isSessionExpired(): boolean {
  const expiresAt = getSessionExpiresAt();
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() <= Date.now();
}

export function setAuthSession(params: { token: string; userId: string; expiresAt?: string }) {
  localStorage.setItem(TOKEN_KEY, params.token);
  localStorage.setItem(CURRENT_USER_KEY, params.userId);
  if (params.expiresAt) {
    localStorage.setItem(EXPIRES_AT_KEY, params.expiresAt);
  } else {
    localStorage.removeItem(EXPIRES_AT_KEY);
  }
}

export function clearAuthSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(CURRENT_USER_KEY);
  localStorage.removeItem(EXPIRES_AT_KEY);
  localStorage.removeItem('FinSync_AuthMode');
}

export function getAuthHeaders(): Record<string, string> {
  const token = getAccessToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

export function isApiAuthEnabled(): boolean {
  return Boolean(getAccessToken()) && !isSessionExpired();
}
