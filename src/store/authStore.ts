import { create } from 'zustand';
import { db, type User } from '../core/db';
import { addToSyncQueue, generateUUID } from '../core/sync/syncEngine';
import { seedDemoData } from '../core/seedDemoData';

interface AuthStore {
  currentUser: User | null;
  allUsers: User[];
  isLoading: boolean;
  login: (userId: string) => Promise<void>;
  logout: () => void;
  register: (name: string, email: string, avatar: string) => Promise<User>;
  refreshUsers: () => Promise<void>;
  seedMockUsers: () => Promise<void>;
}

const DEFAULT_USERS = [
  { id: 'user-bruno-1111-2222-333333333333', name: 'Bruno', email: 'bruno@finsync.com', avatar: '🐻' },
  { id: 'user-pedro-2222-3333-444444444444', name: 'Pedro', email: 'pedro@finsync.com', avatar: '🦊' },
  { id: 'user-jose-3333-4444-555555555555', name: 'José', email: 'jose@finsync.com', avatar: '🦁' },
  { id: 'user-andres-4444-5555-666666666666', name: 'Andrés', email: 'andres@finsync.com', avatar: '🐼' },
  { id: 'user-cristian-5555-6666-777777777777', name: 'Cristian', email: 'cristian@finsync.com', avatar: '🐨' }
];

export const useAuthStore = create<AuthStore>((set, get) => ({
  currentUser: null,
  allUsers: [],
  isLoading: true,

  login: async (userId) => {
    const user = await db.users.get(userId);
    if (user) {
      set({ currentUser: user });
      localStorage.setItem('FinSync_CurrentUser', userId);
    }
  },

  logout: () => {
    set({ currentUser: null });
    localStorage.removeItem('FinSync_CurrentUser');
  },

  register: async (name, email, avatar) => {
    const newUser: User = {
      id: generateUUID(),
      name,
      email,
      avatar: avatar || '👤',
      created_at: new Date().toISOString()
    };

    await db.users.add(newUser);
    await addToSyncQueue('user', newUser.id, 'INSERT', newUser);
    await get().refreshUsers();
    await get().login(newUser.id);
    return newUser;
  },

  refreshUsers: async () => {
    const users = await db.users.toArray();
    set({ allUsers: users });
  },

  seedMockUsers: async () => {
    set({ isLoading: true });
    try {
      const count = await db.users.count();
      if (count === 0) {
        // Sembrar usuarios iniciales
        for (const u of DEFAULT_USERS) {
          const userObj: User = {
            id: u.id,
            name: u.name,
            email: u.email,
            avatar: u.avatar,
            created_at: new Date().toISOString()
          };
          await db.users.add(userObj);
          // Omitimos encolar la sincronización de las semillas para mantener limpia la demo inicial,
          // o las insertamos en el mock remoto de una vez.
        }

        // Sembrar en el mock remoto de una vez para consistencia
        const remoteKey = 'FinSync_MockRemoteDB';
        const remoteData = localStorage.getItem(remoteKey) ? JSON.parse(localStorage.getItem(remoteKey)!) : null;
        if (!remoteData || remoteData.users.length === 0) {
          const newRemoteData = remoteData || {
            users: [], groups: [], group_members: [], events: [], expenses: [], expense_shares: [], settlements: [], notifications: []
          };
          newRemoteData.users = DEFAULT_USERS.map(u => ({
            id: u.id, name: u.name, email: u.email, avatar: u.avatar, created_at: new Date().toISOString()
          }));
          localStorage.setItem(remoteKey, JSON.stringify(newRemoteData));
        }
      }

      await seedDemoData();
      await get().refreshUsers();

      // Cargar sesión persistida
      const savedUserId = localStorage.getItem('FinSync_CurrentUser');
      if (savedUserId) {
        const user = await db.users.get(savedUserId);
        if (user) {
          set({ currentUser: user });
        } else {
          // Loguearse por defecto como Bruno si no hay usuario
          await get().login(DEFAULT_USERS[0].id);
        }
      } else {
        // Loguearse por defecto como Bruno
        await get().login(DEFAULT_USERS[0].id);
      }
    } catch (error) {
      console.error('Error seeding users:', error);
    } finally {
      set({ isLoading: false });
    }
  }
}));
