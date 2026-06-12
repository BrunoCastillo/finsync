import { db, type AppNotification, type Event, type Expense, type ExpenseShare, type Group, type GroupMember, type PersonalExpense } from './db';

export const DEMO_GROUP_ID = 'group-viaje-playa-001122334455';
export const DEMO_EVENT_ID = 'event-cartagena-001122334455';

const DEMO_USER_IDS = [
  'user-bruno-1111-2222-333333333333',
  'user-pedro-2222-3333-444444444444',
  'user-jose-3333-4444-555555555555',
  'user-andres-4444-5555-666666666666',
  'user-cristian-5555-6666-777777777777'
];

const REMOTE_KEY = 'FinSync_MockRemoteDB';

// Sembrar o actualizar datos demo de forma idempotente (put en lugar de add)
export async function seedDemoData(): Promise<void> {
  const demoGroupExists = await db.groups.get(DEMO_GROUP_ID);
  if (demoGroupExists) {
    return;
  }

  const now = new Date().toISOString();
  const brunoId = DEMO_USER_IDS[0];

  const demoGroup: Group = {
    id: DEMO_GROUP_ID,
    name: 'Viaje a la Playa',
    description: 'Gastos compartidos del fin de semana en Cartagena (demo precargada).',
    created_by: brunoId,
    invite_code: 'PLAYA26FS'
  };

  const demoMembers: GroupMember[] = DEMO_USER_IDS.map((userId, index) => ({
    id: `member-demo-${index + 1}-001122334455`,
    group_id: DEMO_GROUP_ID,
    user_id: userId,
    role: userId === brunoId ? 'admin' : 'member'
  }));

  const demoEvent: Event = {
    id: DEMO_EVENT_ID,
    group_id: DEMO_GROUP_ID,
    name: 'Fin de semana en Cartagena',
    status: 'open',
    created_at: now
  };

  const demoExpenses: Expense[] = [
    {
      id: 'expense-demo-almuerzo-001122334455',
      event_id: DEMO_EVENT_ID,
      user_id: brunoId,
      amount: 120,
      description: 'Almuerzo en restaurante',
      category: 'Alimentación',
      created_at: now
    },
    {
      id: 'expense-demo-taxi-001122334455',
      event_id: DEMO_EVENT_ID,
      user_id: DEMO_USER_IDS[1],
      amount: 80,
      description: 'Taxi aeropuerto - hotel',
      category: 'Transporte',
      created_at: now
    },
    {
      id: 'expense-demo-hotel-001122334455',
      event_id: DEMO_EVENT_ID,
      user_id: DEMO_USER_IDS[2],
      amount: 200,
      description: 'Hospedaje compartido (1 noche)',
      category: 'Vivienda',
      created_at: now
    }
  ];

  const demoShares: ExpenseShare[] = [];
  demoExpenses.forEach((expense) => {
    const shareAmount = parseFloat((expense.amount / DEMO_USER_IDS.length).toFixed(2));
    DEMO_USER_IDS.forEach((userId, index) => {
      demoShares.push({
        id: `share-demo-${expense.id.slice(-8)}-${index}`,
        expense_id: expense.id,
        user_id: userId,
        share_amount: shareAmount
      });
    });
  });

  const demoNotifications: AppNotification[] = [
    {
      id: 'notif-demo-welcome-001122334455',
      user_id: brunoId,
      message: 'Bienvenido a FinSync. Explora el grupo demo "Viaje a la Playa" y sus gastos precargados.',
      read: 0,
      created_at: now
    },
    {
      id: 'notif-demo-invite-001122334455',
      user_id: DEMO_USER_IDS[1],
      message: 'Fuiste agregado al grupo "Viaje a la Playa"',
      read: 0,
      created_at: now
    }
  ];

  await db.transaction('rw', [db.groups, db.group_members, db.events, db.expenses, db.expense_shares, db.notifications], async () => {
    await db.groups.put(demoGroup);
    await db.group_members.bulkPut(demoMembers);
    await db.events.put(demoEvent);
    await db.expenses.bulkPut(demoExpenses);
    await db.expense_shares.bulkPut(demoShares);
    await db.notifications.bulkPut(demoNotifications);
  });

  const remoteRaw = localStorage.getItem(REMOTE_KEY);
  const remoteData = remoteRaw
    ? JSON.parse(remoteRaw)
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

  remoteData.groups = [...remoteData.groups.filter((g: Group) => g.id !== DEMO_GROUP_ID), demoGroup];
  remoteData.group_members = [
    ...remoteData.group_members.filter((m: GroupMember) => m.group_id !== DEMO_GROUP_ID),
    ...demoMembers
  ];
  remoteData.events = [...remoteData.events.filter((e: Event) => e.id !== DEMO_EVENT_ID), demoEvent];
  remoteData.expenses = [
    ...remoteData.expenses.filter((e: Expense) => e.event_id !== DEMO_EVENT_ID),
    ...demoExpenses
  ];
  remoteData.expense_shares = [
    ...remoteData.expense_shares.filter((s: ExpenseShare) => !s.expense_id.startsWith('expense-demo-')),
    ...demoShares
  ];
  remoteData.notifications = [
    ...remoteData.notifications.filter((n: AppNotification) => !n.id.startsWith('notif-demo-')),
    ...demoNotifications
  ];

  localStorage.setItem(REMOTE_KEY, JSON.stringify(remoteData));
}

// Sembrar movimientos personales demo para Bruno
export async function seedPersonalDemoData(): Promise<void> {
  const brunoId = DEMO_USER_IDS[0];
  const existingCount = await db.personal_expenses.where('user_id').equals(brunoId).count();
  if (existingCount > 0) return;

  const now = new Date().toISOString();
  const demoPersonal: PersonalExpense[] = [
    {
      id: 'personal-demo-super-001122334455',
      user_id: brunoId,
      amount: 45.5,
      description: 'Supermercado semanal',
      category: 'Alimentación',
      type: 'expense',
      created_at: now
    },
    {
      id: 'personal-demo-freelance-001122334455',
      user_id: brunoId,
      amount: 350,
      description: 'Freelance diseño',
      category: 'Otros',
      type: 'income',
      created_at: now
    },
    {
      id: 'personal-demo-bus-001122334455',
      user_id: brunoId,
      amount: 12,
      description: 'Transporte urbano',
      category: 'Transporte',
      type: 'expense',
      created_at: now
    }
  ];

  await db.personal_expenses.bulkPut(demoPersonal);

  const remoteRaw = localStorage.getItem(REMOTE_KEY);
  const remoteData = remoteRaw
    ? JSON.parse(remoteRaw)
    : {
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

  remoteData.personal_expenses = [
    ...(remoteData.personal_expenses ?? []).filter(
      (row: PersonalExpense) => !row.id.startsWith('personal-demo-')
    ),
    ...demoPersonal
  ];

  localStorage.setItem(REMOTE_KEY, JSON.stringify(remoteData));
}
