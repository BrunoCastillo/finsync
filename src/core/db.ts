import Dexie, { type Table } from 'dexie';

export interface User {
  id: string; // uuid
  email: string;
  name: string;
  avatar: string;
  created_at: string;
}

export interface Group {
  id: string;
  name: string;
  description: string;
  created_by: string;
  invite_code?: string;
}

export interface GroupMember {
  id: string;
  group_id: string;
  user_id: string;
  role: 'admin' | 'member';
}

export interface Event {
  id: string;
  group_id: string;
  name: string;
  status: 'open' | 'closed';
  created_at: string;
}

export interface Expense {
  id: string;
  event_id: string;
  user_id: string; // Quien pagó
  amount: number;
  description: string;
  category: string;
  created_at: string;
}

export interface ExpenseShare {
  id: string;
  expense_id: string;
  user_id: string; // Participante
  share_amount: number;
}

export interface Settlement {
  id: string;
  event_id: string;
  from_user: string; // Deudor
  to_user: string; // Acreedor
  amount: number;
  status: 'pending' | 'settled';
  created_at: string;
}

export interface PersonalExpense {
  id: string;
  user_id: string;
  amount: number;
  description: string;
  category: string;
  type: 'expense' | 'income';
  created_at: string;
}

export interface SyncQueueItem {
  id: string;
  entity_type: 'user' | 'group' | 'group_member' | 'event' | 'expense' | 'expense_share' | 'settlement' | 'notification' | 'personal_expense';
  entity_id: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  payload: string; // JSON string
  status: 'pending' | 'syncing' | 'failed';
  created_at: string;
}

export interface AppNotification {
  id: string;
  user_id: string;
  message: string;
  read: number; // 0 = no leído, 1 = leído (compatibilidad de índices Dexie)
  created_at: string;
}

class FinSyncDatabase extends Dexie {
  users!: Table<User>;
  groups!: Table<Group>;
  group_members!: Table<GroupMember>;
  events!: Table<Event>;
  expenses!: Table<Expense>;
  expense_shares!: Table<ExpenseShare>;
  settlements!: Table<Settlement>;
  sync_queue!: Table<SyncQueueItem>;
  notifications!: Table<AppNotification>;
  personal_expenses!: Table<PersonalExpense>;

  constructor() {
    super('FinSyncDatabase');
    this.version(1).stores({
      users: 'id, email, name, created_at',
      groups: 'id, name, created_by',
      group_members: 'id, group_id, user_id, [group_id+user_id]',
      events: 'id, group_id, name, status',
      expenses: 'id, event_id, user_id, category, created_at',
      expense_shares: 'id, expense_id, user_id, [expense_id+user_id]',
      settlements: 'id, event_id, from_user, to_user, [event_id+from_user+to_user]',
      sync_queue: 'id, entity_type, entity_id, status, created_at',
      notifications: 'id, user_id, read, created_at'
    });
    this.version(2).stores({
      users: 'id, email, name, created_at',
      groups: 'id, name, created_by',
      group_members: 'id, group_id, user_id, [group_id+user_id]',
      events: 'id, group_id, name, status',
      expenses: 'id, event_id, user_id, category, created_at',
      expense_shares: 'id, expense_id, user_id, [expense_id+user_id]',
      settlements: 'id, event_id, from_user, to_user, [event_id+from_user+to_user]',
      sync_queue: 'id, entity_type, entity_id, status, created_at',
      notifications: 'id, user_id, read, created_at',
      personal_expenses: 'id, user_id, category, type, created_at'
    });
    this.version(3).stores({
      users: 'id, email, name, created_at',
      groups: 'id, name, created_by, invite_code',
      group_members: 'id, group_id, user_id, [group_id+user_id]',
      events: 'id, group_id, name, status',
      expenses: 'id, event_id, user_id, category, created_at',
      expense_shares: 'id, expense_id, user_id, [expense_id+user_id]',
      settlements: 'id, event_id, from_user, to_user, [event_id+from_user+to_user]',
      sync_queue: 'id, entity_type, entity_id, status, created_at',
      notifications: 'id, user_id, read, created_at',
      personal_expenses: 'id, user_id, category, type, created_at'
    });
  }
}

export const db = new FinSyncDatabase();
