import { create } from 'zustand';
import { db, type User } from '../core/db';
import { fetchCurrentUserFromApi, loginWithApi, registerWithApi, updateProfileWithApi, changePasswordWithApi } from '../core/auth/authApi';
import {
  clearAuthSession,
  getAccessToken,
  setAuthSession
} from '../core/auth/session';
import { addToSyncQueue, triggerSync } from '../core/sync/syncEngine';
import { backfillMissingInviteCodes } from '../core/groups/joinGroup';
import { validateRegisterInput, validateLoginInput, validatePassword, validateProfileName } from '../core/validation';

interface AuthStore {
  currentUser: User | null;
  allUsers: User[];
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
  logout: () => void;
  refreshUsers: () => Promise<void>;
  initializeAuth: () => Promise<void>;
}

async function persistLocalUser(user: User) {
  await db.users.put(user);
}

async function completeApiSession(authResponse: { access_token: string; user: User }) {
  await persistLocalUser(authResponse.user);
  setAuthSession({
    token: authResponse.access_token,
    userId: authResponse.user.id
  });
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  currentUser: null,
  allUsers: [],
  isLoading: true,

  loginWithCredentials: async (email, password) => {
    const validation = validateLoginInput({ email });
    if (!validation.is_valid) {
      throw new Error(validation.error);
    }

    const authResponse = await loginWithApi({ email: validation.normalized_email, password });
    await completeApiSession(authResponse);
    set({ currentUser: authResponse.user });
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
    set({ currentUser: authResponse.user });
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

  logout: () => {
    clearAuthSession();
    set({ currentUser: null });
  },

  refreshUsers: async () => {
    const users = await db.users.toArray();
    set({ allUsers: users });
  },

  initializeAuth: async () => {
    set({ isLoading: true });
    try {
      await backfillMissingInviteCodes();
      await get().refreshUsers();

      const savedToken = getAccessToken();
      if (savedToken) {
        const remoteUser = await fetchCurrentUserFromApi();
        if (remoteUser) {
          await persistLocalUser(remoteUser);
          set({ currentUser: remoteUser });
          triggerSync();
          return;
        }
        clearAuthSession();
      }
    } catch (error) {
      console.error('Error initializing auth:', error);
    } finally {
      set({ isLoading: false });
    }
  }
}));
