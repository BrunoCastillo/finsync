import { create } from 'zustand';

export type ActiveView = 'dashboard' | 'groups' | 'group-detail' | 'event-detail' | 'notifications' | 'profile';

interface UiStore {
  activeView: ActiveView;
  selectedGroupId: string | null;
  selectedEventId: string | null;
  setView: (view: ActiveView, groupId?: string | null, eventId?: string | null) => void;
}

export const useUiStore = create<UiStore>((set) => ({
  activeView: 'dashboard',
  selectedGroupId: null,
  selectedEventId: null,
  setView: (view, groupId = null, eventId = null) => {
    set({
      activeView: view,
      selectedGroupId: groupId !== undefined ? groupId : null,
      selectedEventId: eventId !== undefined ? eventId : null
    });
    // Scroll a la parte superior de la página en la transición
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}));
