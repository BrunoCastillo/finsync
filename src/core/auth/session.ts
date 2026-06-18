const TOKEN_KEY = 'FinSync_AuthToken';
const CURRENT_USER_KEY = 'FinSync_CurrentUser';

export function getAccessToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthSession(params: { token: string | null; userId: string }) {
  if (params.token) {
    localStorage.setItem(TOKEN_KEY, params.token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
  localStorage.setItem(CURRENT_USER_KEY, params.userId);
}

export function clearAuthSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(CURRENT_USER_KEY);
  localStorage.removeItem('FinSync_AuthMode');
}

export function getAuthHeaders(): Record<string, string> {
  const token = getAccessToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

export function isApiAuthEnabled(): boolean {
  return Boolean(getAccessToken());
}
