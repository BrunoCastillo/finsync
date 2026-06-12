import { db, type SyncQueueItem, type AppNotification } from '../db';
import type { Table } from 'dexie';
import { create } from 'zustand';
import { getAuthHeaders, isApiAuthEnabled } from '../auth/session';
import { showBrowserNotification } from '../notifications/pushNotifications';

// Zustand Store for Sync Status
interface SyncStore {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  syncHistory: string[];
  setOnline: (online: boolean) => void;
  setSyncing: (syncing: boolean) => void;
  updatePendingCount: () => Promise<void>;
  addLog: (log: string) => void;
}

export const useSyncStore = create<SyncStore>((set) => ({
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  isSyncing: false,
  pendingCount: 0,
  syncHistory: [],
  setOnline: (online) => {
    set({ isOnline: online });
    if (online) {
      triggerSync();
    }
  },
  setSyncing: (syncing) => set({ isSyncing: syncing }),
  updatePendingCount: async () => {
    const count = await db.sync_queue.where('status').equals('pending').count();
    set({ pendingCount: count });
  },
  addLog: (log) => {
    const timestamp = new Date().toLocaleTimeString();
    set((state) => ({
      syncHistory: [`[${timestamp}] ${log}`, ...state.syncHistory.slice(0, 19)]
    }));
  }
}));

// Generador de UUID para IndexedDB y Mock
export function generateUUID(): string {
  return crypto.randomUUID();
}

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

const ENTITY_TABLE_MAP: Record<SyncQueueItem['entity_type'], string> = {
  user: 'users',
  group: 'groups',
  group_member: 'group_members',
  event: 'events',
  expense: 'expenses',
  expense_share: 'expense_shares',
  settlement: 'settlements',
  notification: 'notifications',
  personal_expense: 'personal_expenses',
  personal_budget: 'personal_budgets'
};

const MOCK_REMOTE_KEY = 'FinSync_MockRemoteDB';

interface MockRemoteDB {
  users: Record<string, unknown>[];
  groups: Record<string, unknown>[];
  group_members: Record<string, unknown>[];
  events: Record<string, unknown>[];
  expenses: Record<string, unknown>[];
  expense_shares: Record<string, unknown>[];
  settlements: Record<string, unknown>[];
  notifications: Record<string, unknown>[];
  personal_expenses: Record<string, unknown>[];
  personal_budgets: Record<string, unknown>[];
}

type RemoteRow = Record<string, unknown> & { id: string };

const EMPTY_MOCK_REMOTE: MockRemoteDB = {
  users: [],
  groups: [],
  group_members: [],
  events: [],
  expenses: [],
  expense_shares: [],
  settlements: [],
  notifications: [],
  personal_expenses: [],
  personal_budgets: []
};

const PULL_MERGE_ORDER: Array<{
  entityType: SyncQueueItem['entity_type'];
  remoteKey: keyof MockRemoteDB;
  table: Table<{ id: string }>;
}> = [
  { entityType: 'user', remoteKey: 'users', table: db.users },
  { entityType: 'group', remoteKey: 'groups', table: db.groups },
  { entityType: 'group_member', remoteKey: 'group_members', table: db.group_members },
  { entityType: 'event', remoteKey: 'events', table: db.events },
  { entityType: 'expense', remoteKey: 'expenses', table: db.expenses },
  { entityType: 'expense_share', remoteKey: 'expense_shares', table: db.expense_shares },
  { entityType: 'settlement', remoteKey: 'settlements', table: db.settlements },
  { entityType: 'notification', remoteKey: 'notifications', table: db.notifications },
  { entityType: 'personal_expense', remoteKey: 'personal_expenses', table: db.personal_expenses },
  { entityType: 'personal_budget', remoteKey: 'personal_budgets', table: db.personal_budgets }
];

function getMockRemoteDB(): MockRemoteDB {
  const data = localStorage.getItem(MOCK_REMOTE_KEY);
  if (!data) return { ...EMPTY_MOCK_REMOTE };
  const parsed = JSON.parse(data) as Partial<MockRemoteDB>;
  return {
    ...EMPTY_MOCK_REMOTE,
    ...parsed,
    personal_expenses: parsed.personal_expenses ?? [],
    personal_budgets: parsed.personal_budgets ?? []
  };
}

function saveMockRemoteDB(dbData: MockRemoteDB) {
  localStorage.setItem(MOCK_REMOTE_KEY, JSON.stringify(dbData));
}

function resolveTableKey(entityType: SyncQueueItem['entity_type']): keyof MockRemoteDB {
  return ENTITY_TABLE_MAP[entityType] as keyof MockRemoteDB;
}

function buildPendingKey(entityType: SyncQueueItem['entity_type'], entityId: string): string {
  return `${entityType}:${entityId}`;
}

async function getPendingActionsByEntity(): Promise<Map<string, SyncQueueItem['action']>> {
  const pendingItems = await db.sync_queue.where('status').equals('pending').toArray();
  const pendingActions = new Map<string, SyncQueueItem['action']>();

  for (const item of pendingItems) {
    pendingActions.set(buildPendingKey(item.entity_type, item.entity_id), item.action);
  }

  return pendingActions;
}

function applySyncToMockRemote(item: SyncQueueItem, payload: Record<string, unknown>) {
  const remoteDB = getMockRemoteDB();
  const tableKey = resolveTableKey(item.entity_type);
  const tableRows = remoteDB[tableKey] as Record<string, unknown>[];

  if (item.action === 'INSERT') {
    const idx = tableRows.findIndex((row) => row.id === item.entity_id);
    if (idx >= 0) {
      tableRows[idx] = payload;
    } else {
      tableRows.push(payload);
    }
  } else if (item.action === 'UPDATE') {
    const idx = tableRows.findIndex((row) => row.id === item.entity_id);
    if (idx >= 0) {
      tableRows[idx] = { ...tableRows[idx], ...payload };
    } else {
      tableRows.push(payload);
    }
  } else if (item.action === 'DELETE') {
    remoteDB[tableKey] = tableRows.filter((row) => row.id !== item.entity_id) as MockRemoteDB[typeof tableKey];
  }

  saveMockRemoteDB(remoteDB);
}

async function syncItemToApi(item: SyncQueueItem, payload: Record<string, unknown>): Promise<boolean> {
  if (!isApiAuthEnabled()) return false;

  try {
    const response = await fetch(`${API_BASE}/api/sync/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify({
        entity_type: item.entity_type,
        entity_id: item.entity_id,
        action: item.action,
        payload
      })
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function fetchRemoteStore(): Promise<{ store: MockRemoteDB; source: 'api' | 'mock' }> {
  if (!isApiAuthEnabled()) {
    return { store: getMockRemoteDB(), source: 'mock' };
  }

  try {
    const response = await fetch(`${API_BASE}/api/sync/pull`, {
      cache: 'no-store',
      headers: getAuthHeaders()
    });
    if (response.ok) {
      const data = (await response.json()) as Partial<MockRemoteDB>;
      return {
        store: {
          ...EMPTY_MOCK_REMOTE,
          ...data,
          personal_expenses: data.personal_expenses ?? [],
          personal_budgets: data.personal_budgets ?? []
        },
        source: 'api'
      };
    }
  } catch {
    // Fallback al mock local cuando la API no está disponible
  }

  return { store: getMockRemoteDB(), source: 'mock' };
}

async function mergeRemoteTable(
  table: Table<{ id: string }>,
  entityType: SyncQueueItem['entity_type'],
  remoteRows: RemoteRow[],
  pendingActions: Map<string, SyncQueueItem['action']>
): Promise<number> {
  let mergedCount = 0;
  const remoteIds = new Set(remoteRows.map((row) => String(row.id)));

  await db.transaction('rw', table, async () => {
    for (const row of remoteRows) {
      const entityId = String(row.id);
      if (pendingActions.has(buildPendingKey(entityType, entityId))) {
        continue;
      }

      const existing = await table.get(entityId);
      await table.put(row as { id: string });
      mergedCount += 1;

      if (entityType === 'notification' && !existing) {
        const notification = row as unknown as AppNotification;
        const currentUserId = localStorage.getItem('FinSync_CurrentUser');
        if (notification.read === 0 && notification.user_id === currentUserId) {
          await showBrowserNotification({
            title: 'FinSync',
            body: notification.message,
            tag: notification.id,
            url: '/'
          });
        }
      }
    }

    const localRows = await table.toArray();
    for (const localRow of localRows) {
      const entityId = String(localRow.id);
      if (remoteIds.has(entityId)) continue;
      if (pendingActions.has(buildPendingKey(entityType, entityId))) continue;

      await table.delete(entityId);
      mergedCount += 1;
    }
  });

  return mergedCount;
}

// Descargar y fusionar cambios remotos en IndexedDB (multi-dispositivo)
export async function pullRemoteChanges(): Promise<number> {
  const { store: remoteStore, source } = await fetchRemoteStore();
  const pendingActions = await getPendingActionsByEntity();
  let totalMerged = 0;

  for (const config of PULL_MERGE_ORDER) {
    const remoteRows = remoteStore[config.remoteKey] as RemoteRow[];
    totalMerged += await mergeRemoteTable(config.table, config.entityType, remoteRows, pendingActions);
  }

  useSyncStore.getState().addLog(`Pull (${source}): ${totalMerged} operaciones de fusión.`);
  return totalMerged;
}

async function pushPendingItems(): Promise<number> {
  const store = useSyncStore.getState();
  const pendingItems = await db.sync_queue.where('status').equals('pending').sortBy('created_at');

  if (pendingItems.length === 0) {
    return 0;
  }

  store.addLog(`Subiendo ${pendingItems.length} cambios locales...`);
  let pushedCount = 0;

  for (const item of pendingItems) {
    await new Promise((resolve) => setTimeout(resolve, 400));

    if (!useSyncStore.getState().isOnline) {
      store.addLog('Subida interrumpida: conexión perdida.');
      break;
    }

    await db.sync_queue.update(item.id, { status: 'syncing' });

    const payload = JSON.parse(item.payload) as Record<string, unknown>;
    const syncedToApi = await syncItemToApi(item, payload);

    if (syncedToApi) {
      store.addLog(`Push API: ${item.entity_type.toUpperCase()} - ${item.action}`);
    } else {
      applySyncToMockRemote(item, payload);
      store.addLog(`Push local: ${item.entity_type.toUpperCase()} - ${item.action}`);
    }

    await db.sync_queue.delete(item.id);
    await store.updatePendingCount();
    pushedCount += 1;
  }

  return pushedCount;
}

// Agregar elemento a la cola de sincronización local
export async function addToSyncQueue(
  entity_type: SyncQueueItem['entity_type'],
  entity_id: string,
  action: SyncQueueItem['action'],
  payloadObj: unknown
) {
  const queueItem: SyncQueueItem = {
    id: generateUUID(),
    entity_type,
    entity_id,
    action,
    payload: JSON.stringify(payloadObj),
    status: 'pending',
    created_at: new Date().toISOString()
  };

  await db.sync_queue.add(queueItem);
  await useSyncStore.getState().updatePendingCount();

  if (useSyncStore.getState().isOnline) {
    triggerSync();
  }
}

let syncTimeout: ReturnType<typeof setTimeout> | null = null;

// Disparar sincronización bidireccional (push + pull)
export function triggerSync() {
  if (syncTimeout) clearTimeout(syncTimeout);

  syncTimeout = setTimeout(() => {
    processSyncQueue().catch(console.error);
  }, 500);
}

async function processSyncQueue() {
  const store = useSyncStore.getState();
  if (!store.isOnline || store.isSyncing) return;

  store.setSyncing(true);
  store.addLog('Iniciando sincronización bidireccional...');

  try {
    await pushPendingItems();
    await pullRemoteChanges();
    store.addLog('Sincronización completada con éxito.');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    store.addLog(`Error de sincronización: ${message}`);
    console.error('Sync queue error:', err);
  } finally {
    store.setSyncing(false);
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    useSyncStore.getState().setOnline(true);
  });
  window.addEventListener('offline', () => {
    useSyncStore.getState().setOnline(false);
  });

  window.addEventListener('focus', () => {
    if (useSyncStore.getState().isOnline) {
      triggerSync();
    }
  });

  db.sync_queue
    .where('status')
    .equals('pending')
    .count()
    .then((count) => {
      useSyncStore.setState({ pendingCount: count });
    })
    .catch(console.error);

  setTimeout(() => {
    if (useSyncStore.getState().isOnline) {
      triggerSync();
    }
  }, 1500);
}
