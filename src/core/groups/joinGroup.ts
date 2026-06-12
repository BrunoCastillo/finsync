import { db, type AppNotification, type Group, type GroupMember } from '../db';
import { joinGroupByCodeApi } from './groupsApi';
import { isApiAuthEnabled } from '../auth/session';
import { generateInviteCode, normalizeInviteCode } from '../inviteCode';
import { addToSyncQueue, generateUUID, triggerSync } from '../sync/syncEngine';

const MOCK_REMOTE_KEY = 'FinSync_MockRemoteDB';

interface MockRemoteDB {
  groups: Group[];
  group_members: GroupMember[];
  notifications: AppNotification[];
}

function readMockRemoteDb(): MockRemoteDB {
  const raw = localStorage.getItem(MOCK_REMOTE_KEY);
  if (!raw) {
    return { groups: [], group_members: [], notifications: [] };
  }
  const parsed = JSON.parse(raw) as Partial<MockRemoteDB>;
  return {
    groups: parsed.groups ?? [],
    group_members: parsed.group_members ?? [],
    notifications: parsed.notifications ?? []
  };
}

function writeMockRemoteDb(data: MockRemoteDB) {
  const existing = localStorage.getItem(MOCK_REMOTE_KEY);
  const parsed = existing ? JSON.parse(existing) : {};
  localStorage.setItem(
    MOCK_REMOTE_KEY,
    JSON.stringify({
      ...parsed,
      groups: data.groups,
      group_members: data.group_members,
      notifications: data.notifications
    })
  );
}

async function findGroupByInviteCode(inviteCode: string): Promise<Group | null> {
  const normalized = normalizeInviteCode(inviteCode);
  const localGroups = await db.groups.toArray();
  const localMatch = localGroups.find(
    (group) => group.invite_code && normalizeInviteCode(group.invite_code) === normalized
  );
  if (localMatch) return localMatch;

  const mockDb = readMockRemoteDb();
  return (
    mockDb.groups.find(
      (group) => group.invite_code && normalizeInviteCode(group.invite_code) === normalized
    ) ?? null
  );
}

async function ensureLocalGroup(group: Group) {
  await db.groups.put(group);
}

// Une al usuario autenticado a un grupo mediante código de invitación
export async function joinGroupByInviteCode(params: {
  inviteCode: string;
  userId: string;
  userName: string;
}): Promise<{ group: Group; alreadyMember: boolean }> {
  const normalized = normalizeInviteCode(params.inviteCode);
  if (normalized.length < 6) {
    throw new Error('Ingresa un código de invitación válido.');
  }

  if (isApiAuthEnabled()) {
    const response = await joinGroupByCodeApi(normalized);
    await db.groups.put(response.group);
    if (response.membership) {
      await db.group_members.put(response.membership);
    }
    if (response.notification) {
      await db.notifications.put(response.notification);
    }
    await triggerSync();
    return { group: response.group, alreadyMember: response.already_member };
  }

  const targetGroup = await findGroupByInviteCode(normalized);
  if (!targetGroup) {
    throw new Error('Código inválido. Verifica el código o pide uno nuevo al administrador.');
  }

  await ensureLocalGroup(targetGroup);

  const existingMembership = await db.group_members
    .where('[group_id+user_id]')
    .equals([targetGroup.id, params.userId])
    .first();

  if (existingMembership) {
    return { group: targetGroup, alreadyMember: true };
  }

  const membership: GroupMember = {
    id: generateUUID(),
    group_id: targetGroup.id,
    user_id: params.userId,
    role: 'member'
  };

  const notification: AppNotification = {
    id: generateUUID(),
    user_id: params.userId,
    message: `Te uniste al grupo "${targetGroup.name}" con código de invitación.`,
    read: 0,
    created_at: new Date().toISOString()
  };

  await db.group_members.add(membership);
  await db.notifications.add(notification);
  await addToSyncQueue('group_member', membership.id, 'INSERT', membership);
  await addToSyncQueue('notification', notification.id, 'INSERT', notification);

  const mockDb = readMockRemoteDb();
  const mockGroupIndex = mockDb.groups.findIndex((group) => group.id === targetGroup.id);
  if (mockGroupIndex >= 0) {
    mockDb.groups[mockGroupIndex] = targetGroup;
  } else {
    mockDb.groups.push(targetGroup);
  }
  mockDb.group_members.push(membership);
  mockDb.notifications.push(notification);
  writeMockRemoteDb(mockDb);

  return { group: targetGroup, alreadyMember: false };
}

// Completa códigos faltantes en grupos locales existentes
export async function backfillMissingInviteCodes(): Promise<void> {
  const groups = await db.groups.toArray();
  for (const group of groups) {
    if (group.invite_code) continue;
    const updatedGroup: Group = {
      ...group,
      invite_code: generateInviteCode()
    };
    await db.groups.put(updatedGroup);
    await addToSyncQueue('group', group.id, 'UPDATE', updatedGroup);
  }
}
