import { create } from 'zustand';
import { db, type User } from '../core/db';
import {
  fetchCurrentUserFromApi,
  isRegisterPendingVerification,
  loginWithApi,
  registerWithApi,
  resendVerificationWithApi,
  refreshSessionWithApi,
  updateProfileWithApi,
  changePasswordWithApi,
  verifyEmailWithApi,
  type AuthSessionResponse
} from '../core/auth/authApi';
import {
  clearAuthSession,
  getAccessToken,
  isSessionExpired,
  setAuthSession
} from '../core/auth/session';
import { addToSyncQueue, triggerSync } from '../core/sync/syncEngine';
import { backfillMissingInviteCodes } from '../core/groups/joinGroup';
import { validateRegisterInput, validateLoginInput, validatePassword, validateProfileName } from '../core/validation';

export interface PendingVerificationState {
  email: string;
  message: string;
  debugLink?: string;
}

interface AuthStore {
  currentUser: User | null;
  allUsers: User[];
  isLoading: boolean;
  pendingVerification: PendingVerificationState | null;
  loginWithCredentials: (email: string, password: string) => Promise<void>;
  registerWithCredentials: (
    name: string,
    email: string,
    password: string,
    avatar: string
  ) => Promise<PendingVerificationState | null>;
  verifyEmail: (token: string) => Promise<void>;
  resendVerification: (email: string) => Promise<string>;
  clearPendingVerification: () => void;
  updateProfile: (name: string, avatar: string) => Promise<User>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  logout: () => void;
  refreshUsers: () => Promise<void>;
  initializeAuth: () => Promise<void>;
}

async function persistLocalUser(user: User) {
  await db.users.put(user);
}

async function completeApiSession(authResponse: AuthSessionResponse) {
  await persistLocalUser(authResponse.user);
  setAuthSession({
    token: authResponse.access_token,
    userId: authResponse.user.id,
    expiresAt: authResponse.expires_at
  });
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  currentUser: null,
  allUsers: [],
  isLoading: true,
  pendingVerification: null,

  loginWithCredentials: async (email, password) => {
    const validation = validateLoginInput({ email });
    if (!validation.is_valid) {
      throw new Error(validation.error);
    }

    const authResponse = await loginWithApi({ email: validation.normalized_email, password });
    await completeApiSession(authResponse);
    set({ currentUser: authResponse.user, pendingVerification: null });
    await get().refreshUsers();
    triggerSync();
  },

  registerWithCredentials: async (name, email, password, avatar) => {
    const validation = validateRegisterInput({ name, email });
    if (!validation.is_valid) {
      throw new Error(validation.error);
    }

    const registerResponse = await registerWithApi({
      name: validation.normalized_name,
      email: validation.normalized_email,
      password,
      avatar
    });

    if (isRegisterPendingVerification(registerResponse)) {
      const pendingVerification: PendingVerificationState = {
        email: registerResponse.email,
        message: registerResponse.message,
        debugLink: registerResponse.debug_link
      };
      set({ pendingVerification, currentUser: null });
      clearAuthSession();
      return pendingVerification;
    }

    await completeApiSession(registerResponse);
    set({ currentUser: registerResponse.user, pendingVerification: null });
    await get().refreshUsers();
    triggerSync();
    return null;
  },

  verifyEmail: async (token) => {
    const authResponse = await verifyEmailWithApi(token);
    await completeApiSession(authResponse);
    set({ currentUser: authResponse.user, pendingVerification: null });
    await get().refreshUsers();
    triggerSync();
  },

  resendVerification: async (email) => {
    const validation = validateLoginInput({ email });
    if (!validation.is_valid) {
      throw new Error(validation.error);
    }

    const response = await resendVerificationWithApi(validation.normalized_email);
    set((state) => ({
      pendingVerification: state.pendingVerification
        ? {
            ...state.pendingVerification,
            message: response.message,
            debugLink: response.debug_link ?? state.pendingVerification.debugLink
          }
        : {
            email: validation.normalized_email,
            message: response.message,
            debugLink: response.debug_link
          }
    }));
    return response.message;
  },

  clearPendingVerification: () => {
    set({ pendingVerification: null });
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
    set({ currentUser: null, pendingVerification: null });
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
      if (!savedToken) return;

      if (isSessionExpired()) {
        clearAuthSession();
        return;
      }

      try {
        const refreshed = await refreshSessionWithApi();
        await completeApiSession(refreshed);
        set({ currentUser: refreshed.user, pendingVerification: null });
        triggerSync();
        return;
      } catch {
        const remoteUser = await fetchCurrentUserFromApi();
        if (remoteUser) {
          await persistLocalUser(remoteUser);
          set({ currentUser: remoteUser, pendingVerification: null });
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
