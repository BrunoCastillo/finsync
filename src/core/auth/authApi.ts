import type { User } from '../db';
import { getAccessToken, getAuthHeaders } from './session';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

export interface AuthSessionResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  expires_at: string;
  email_verified: boolean;
  user: User;
}

export interface RegisterPendingVerificationResponse {
  requires_verification: true;
  email: string;
  message: string;
  delivery_mode?: string;
  debug_link?: string;
}

export type RegisterApiResponse = AuthSessionResponse | RegisterPendingVerificationResponse;

interface AuthApiError {
  detail?: string | { msg?: string }[];
}

async function parseAuthError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as AuthApiError;
    if (typeof data.detail === 'string') return data.detail;
    if (Array.isArray(data.detail) && data.detail[0]?.msg) {
      return data.detail[0].msg;
    }
  } catch {
    // Respuesta no JSON
  }
  return `Error del servidor (${response.status}).`;
}

async function postAuthJson<T>(path: string, body: Record<string, string>): Promise<T> {
  const response = await fetch(`${API_BASE}/api/auth/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(await parseAuthError(response));
  }

  return response.json() as Promise<T>;
}

export async function registerWithApi(params: {
  name: string;
  email: string;
  password: string;
  avatar: string;
}): Promise<RegisterApiResponse> {
  return postAuthJson('register', {
    name: params.name,
    email: params.email,
    password: params.password,
    avatar: params.avatar
  });
}

export async function loginWithApi(params: {
  email: string;
  password: string;
}): Promise<AuthSessionResponse> {
  return postAuthJson('login', {
    email: params.email,
    password: params.password
  });
}

export async function verifyEmailWithApi(token: string): Promise<AuthSessionResponse> {
  return postAuthJson('verify-email', { token });
}

export async function resendVerificationWithApi(email: string): Promise<{
  ok: boolean;
  message: string;
  debug_link?: string;
}> {
  return postAuthJson('resend-verification', { email });
}

export async function refreshSessionWithApi(): Promise<AuthSessionResponse> {
  const response = await fetch(`${API_BASE}/api/auth/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    }
  });

  if (!response.ok) {
    throw new Error(await parseAuthError(response));
  }

  return response.json() as Promise<AuthSessionResponse>;
}

export async function fetchCurrentUserFromApi(): Promise<User | null> {
  const token = getAccessToken();
  if (!token) return null;

  const response = await fetch(`${API_BASE}/api/auth/me`, {
    headers: {
      ...getAuthHeaders()
    }
  });

  if (!response.ok) return null;

  const data = (await response.json()) as { user: User };
  return data.user;
}

async function requestAuthJson<T>(
  path: string,
  options: { method: string; body?: Record<string, string> }
): Promise<T> {
  const response = await fetch(`${API_BASE}/api/auth/${path}`, {
    method: options.method,
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  if (!response.ok) {
    throw new Error(await parseAuthError(response));
  }

  return response.json() as Promise<T>;
}

export async function updateProfileWithApi(params: {
  name: string;
  avatar: string;
}): Promise<{ user: User }> {
  return requestAuthJson('profile', {
    method: 'PATCH',
    body: {
      name: params.name,
      avatar: params.avatar
    }
  });
}

export async function changePasswordWithApi(params: {
  current_password: string;
  new_password: string;
}): Promise<void> {
  await requestAuthJson('change-password', {
    method: 'POST',
    body: {
      current_password: params.current_password,
      new_password: params.new_password
    }
  });
}

export function isRegisterPendingVerification(
  response: RegisterApiResponse
): response is RegisterPendingVerificationResponse {
  return 'requires_verification' in response && response.requires_verification === true;
}
