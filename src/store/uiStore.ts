import { create } from 'zustand';

export type ActiveView = 'dashboard' | 'personal' | 'groups' | 'group-detail' | 'event-detail' | 'notifications' | 'profile';

interface UiStore {
  activeView: ActiveView;
  selectedGroupId: string | null;
  selectedEventId: string | null;
  openExpenseFormOnNavigate: boolean;
  openPersonalFormOnNavigate: boolean;
  setView: (
    view: ActiveView,
    groupId?: string | null,
    eventId?: string | null,
    openExpenseForm?: boolean,
    openPersonalForm?: boolean
  ) => void;
  clearExpenseFormIntent: () => void;
  clearPersonalFormIntent: () => void;
}

export const useUiStore = create<UiStore>((set) => ({
  activeView: 'dashboard',
  selectedGroupId: null,
  selectedEventId: null,
  openExpenseFormOnNavigate: false,
  openPersonalFormOnNavigate: false,
  setView: (view, groupId = null, eventId = null, openExpenseForm = false, openPersonalForm = false) => {
    set({
      activeView: view,
      selectedGroupId: groupId,
      selectedEventId: eventId,
      openExpenseFormOnNavigate: openExpenseForm,
      openPersonalFormOnNavigate: openPersonalForm
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },
  clearExpenseFormIntent: () => set({ openExpenseFormOnNavigate: false }),
  clearPersonalFormIntent: () => set({ openPersonalFormOnNavigate: false })
}));
