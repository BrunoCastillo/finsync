import { create } from 'zustand';
import { db, type User } from '../core/db';
import { fetchCurrentUserFromApi, loginWithApi, registerWithApi, updateProfileWithApi, changePasswordWithApi } from '../core/auth/authApi';
import {
  clearAuthSession,
  getAccessToken,
  getAuthMode,
  setAuthSession,
  type AuthMode
} from '../core/auth/session';
import { addToSyncQueue, triggerSync } from '../core/sync/syncEngine';
import { backfillMissingInviteCodes } from '../core/groups/joinGroup';
import { seedDemoData, seedPersonalDemoData } from '../core/seedDemoData';
import { validateRegisterInput, validateLoginInput, validatePassword, validateProfileName } from '../core/validation';

interface AuthStore {
  currentUser: User | null;
  allUsers: User[];
  authMode: AuthMode | null;
  isLoading: boolean;
  loginWithCredentials: (email: string, password: string) => Promise<void>;
  registerWithCredentials: (
    name: string,
    email: string,
    password: string,
    avatar: string
  ) => Promise<User>;
  updateProfile: (name: string, avatar: string) => Promise<User>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  loginDemo: (userId: string) => Promise<void>;
  logout: () => void;
  refreshUsers: () => Promise<void>;
  initializeAuth: () => Promise<void>;
}

const DEFAULT_USERS = [
  { id: 'user-bruno-1111-2222-333333333333', name: 'Bruno', email: 'bruno@finsync.com', avatar: '🐻' },
  { id: 'user-pedro-2222-3333-444444444444', name: 'Pedro', email: 'pedro@finsync.com', avatar: '🦊' },
  { id: 'user-jose-3333-4444-555555555555', name: 'José', email: 'jose@finsync.com', avatar: '🦁' },
  { id: 'user-andres-4444-5555-666666666666', name: 'Andrés', email: 'andres@finsync.com', avatar: '🐼' },
  { id: 'user-cristian-5555-6666-777777777777', name: 'Cristian', email: 'cristian@finsync.com', avatar: '🐨' }
];

async function persistLocalUser(user: User) {
  await db.users.put(user);
}

async function completeApiSession(authResponse: { access_token: string; user: User }) {
  await persistLocalUser(authResponse.user);
  setAuthSession({
    token: authResponse.access_token,
    mode: 'api',
    userId: authResponse.user.id
  });
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  currentUser: null,
  allUsers: [],
  authMode: null,
  isLoading: true,

  loginWithCredentials: async (email, password) => {
    const validation = validateLoginInput({ email });
    if (!validation.is_valid) {
      throw new Error(validation.error);
    }

    const authResponse = await loginWithApi({ email: validation.normalized_email, password });
    await completeApiSession(authResponse);
    set({ currentUser: authResponse.user, authMode: 'api' });
    await get().refreshUsers();
    triggerSync();
  },

  registerWithCredentials: async (name, email, password, avatar) => {
    const validation = validateRegisterInput({ name, email });
    if (!validation.is_valid) {
      throw new Error(validation.error);
    }

    const authResponse = await registerWithApi({
      name: validation.normalized_name,
      email: validation.normalized_email,
      password,
      avatar
    });

    await completeApiSession(authResponse);
    set({ currentUser: authResponse.user, authMode: 'api' });
    await get().refreshUsers();
    triggerSync();
    return authResponse.user;
  },

  updateProfile: async (name, avatar) => {
    const validation = validateProfileName({ name });
    if (!validation.is_valid) {
      throw new Error(validation.error);
    }

    const response = await updateProfileWithApi({
      name: validation.normalized_name,
      avatar
    });
    await persistLocalUser(response.user);
    await addToSyncQueue('user', response.user.id, 'UPDATE', response.user);
    set({ currentUser: response.user });
    await get().refreshUsers();
    triggerSync();
    return response.user;
  },

  changePassword: async (currentPassword, newPassword) => {
    const passwordValidation = validatePassword({ password: newPassword });
    if (!passwordValidation.is_valid) {
      throw new Error(passwordValidation.error);
    }

    await changePasswordWithApi({
      current_password: currentPassword,
      new_password: newPassword
    });
  },

  loginDemo: async (userId) => {
    const user = await db.users.get(userId);
    if (!user) {
      throw new Error('Usuario demo no encontrado.');
    }

    setAuthSession({ token: null, mode: 'demo', userId });
    set({ currentUser: user, authMode: 'demo' });
  },

  logout: () => {
    clearAuthSession();
    set({ currentUser: null, authMode: null });
  },

  refreshUsers: async () => {
    const users = await db.users.toArray();
    set({ allUsers: users });
  },

  initializeAuth: async () => {
    set({ isLoading: true });
    try {
      for (const demoUser of DEFAULT_USERS) {
        const existing = await db.users.get(demoUser.id);
        await db.users.put({
          id: demoUser.id,
          name: demoUser.name,
          email: demoUser.email,
          avatar: demoUser.avatar,
          created_at: existing?.created_at ?? new Date().toISOString()
        });
      }

      const remoteKey = 'FinSync_MockRemoteDB';
      const remoteData = localStorage.getItem(remoteKey) ? JSON.parse(localStorage.getItem(remoteKey)!) : null;
      if (!remoteData || remoteData.users.length === 0) {
        const newRemoteData = remoteData || {
          users: [],
          groups: [],
          group_members: [],
          events: [],
          expenses: [],
          expense_shares: [],
          settlements: [],
          notifications: [],
          personal_expenses: []
        };
        newRemoteData.users = DEFAULT_USERS.map((user) => ({
          id: user.id,
          name: user.name,
          email: user.email,
          avatar: user.avatar,
          created_at: new Date().toISOString()
        }));
        localStorage.setItem(remoteKey, JSON.stringify(newRemoteData));
      }

      await seedDemoData();
      await seedPersonalDemoData();
      await backfillMissingInviteCodes();
      await get().refreshUsers();

      const savedMode = getAuthMode();
      const savedToken = getAccessToken();

      if (savedMode === 'api' && savedToken) {
        const remoteUser = await fetchCurrentUserFromApi();
        if (remoteUser) {
          await persistLocalUser(remoteUser);
          set({ currentUser: remoteUser, authMode: 'api' });
          triggerSync();
          return;
        }
        clearAuthSession();
      }

      if (savedMode === 'demo') {
        const savedUserId = localStorage.getItem('FinSync_CurrentUser');
        if (savedUserId) {
          const demoUser = await db.users.get(savedUserId);
          if (demoUser) {
            set({ currentUser: demoUser, authMode: 'demo' });
            return;
          }
        }
      }
    } catch (error) {
      console.error('Error initializing auth:', error);
    } finally {
      set({ isLoading: false });
    }
  }
}));
