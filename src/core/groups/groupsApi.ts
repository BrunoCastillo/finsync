import type { AppNotification, Group, GroupMember } from '../db';
import { getAuthHeaders } from '../auth/session';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

export interface JoinGroupApiResponse {
  group: Group;
  membership: GroupMember | null;
  notification: AppNotification | null;
  already_member: boolean;
}

async function parseApiError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { detail?: string };
    if (typeof data.detail === 'string') return data.detail;
  } catch {
    // Respuesta no JSON
  }
  return `Error del servidor (${response.status}).`;
}

export async function joinGroupByCodeApi(inviteCode: string): Promise<JoinGroupApiResponse> {
  const response = await fetch(`${API_BASE}/api/groups/join`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify({ invite_code: inviteCode })
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  return response.json() as Promise<JoinGroupApiResponse>;
}
