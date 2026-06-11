import { db, type SyncQueueItem } from '../db';
import { create } from 'zustand';

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
  notification: 'notifications'
};

// Inicializar base de datos remota simulada en LocalStorage
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
}

function getMockRemoteDB(): MockRemoteDB {
  const data = localStorage.getItem(MOCK_REMOTE_KEY);
  return data
    ? JSON.parse(data)
    : {
        users: [],
        groups: [],
        group_members: [],
        events: [],
        expenses: [],
        expense_shares: [],
        settlements: [],
        notifications: []
      };
}

function saveMockRemoteDB(dbData: MockRemoteDB) {
  localStorage.setItem(MOCK_REMOTE_KEY, JSON.stringify(dbData));
}

function resolveTableKey(entityType: SyncQueueItem['entity_type']): keyof MockRemoteDB {
  return ENTITY_TABLE_MAP[entityType] as keyof MockRemoteDB;
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
  try {
    const response = await fetch(`${API_BASE}/api/sync/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

  // Intentar sincronizar inmediatamente si estamos online
  if (useSyncStore.getState().isOnline) {
    triggerSync();
  }
}

let syncTimeout: ReturnType<typeof setTimeout> | null = null;

// Disparar sincronización
export function triggerSync() {
  if (syncTimeout) clearTimeout(syncTimeout);

  syncTimeout = setTimeout(() => {
    processSyncQueue().catch(console.error);
  }, 500);
}

// Procesar cola de sincronización (FIFO)
async function processSyncQueue() {
  const store = useSyncStore.getState();
  if (!store.isOnline || store.isSyncing) return;

  const pendingItems = await db.sync_queue
    .where('status')
    .equals('pending')
    .sortBy('created_at');

  if (pendingItems.length === 0) {
    return;
  }

  store.setSyncing(true);
  store.addLog(`Iniciando sincronización de ${pendingItems.length} elementos...`);

  try {
    for (const item of pendingItems) {
      await new Promise((resolve) => setTimeout(resolve, 800));

      if (!useSyncStore.getState().isOnline) {
        store.addLog('Sincronización interrumpida: Conexión perdida.');
        break;
      }

      await db.sync_queue.update(item.id, { status: 'syncing' });

      const payload = JSON.parse(item.payload) as Record<string, unknown>;
      const syncedToApi = await syncItemToApi(item, payload);

      if (syncedToApi) {
        store.addLog(`API: ${item.entity_type.toUpperCase()} - ${item.action}`);
      } else {
        applySyncToMockRemote(item, payload);
        store.addLog(`Local: ${item.entity_type.toUpperCase()} - ${item.action}`);
      }

      await db.sync_queue.delete(item.id);
      await store.updatePendingCount();
    }

    store.addLog('Sincronización completada con éxito.');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    store.addLog(`Error de sincronización: ${message}`);
    console.error('Sync queue error:', err);
  } finally {
    store.setSyncing(false);
  }
}

// Inicializar detectores de red en el navegador
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    useSyncStore.getState().setOnline(true);
  });
  window.addEventListener('offline', () => {
    useSyncStore.getState().setOnline(false);
  });

  db.sync_queue
    .where('status')
    .equals('pending')
    .count()
    .then((count) => {
      useSyncStore.setState({ pendingCount: count });
    })
    .catch(console.error);
}
