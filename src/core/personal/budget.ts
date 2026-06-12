import { db, type PersonalBudget } from '../db';
import { addToSyncQueue, generateUUID } from '../sync/syncEngine';

export function getCurrentMonthKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export async function getMonthlyBudget(userId: string, monthKey = getCurrentMonthKey()): Promise<PersonalBudget | undefined> {
  return db.personal_budgets.where('[user_id+month_key]').equals([userId, monthKey]).first();
}

export async function saveMonthlyBudget(params: {
  userId: string;
  limitAmount: number;
  monthKey?: string;
}): Promise<PersonalBudget> {
  const monthKey = params.monthKey ?? getCurrentMonthKey();
  const existing = await getMonthlyBudget(params.userId, monthKey);
  const budget: PersonalBudget = existing
    ? {
        ...existing,
        limit_amount: params.limitAmount,
        updated_at: new Date().toISOString()
      }
    : {
        id: generateUUID(),
        user_id: params.userId,
        month_key: monthKey,
        limit_amount: params.limitAmount,
        updated_at: new Date().toISOString()
      };

  await db.personal_budgets.put(budget);
  await addToSyncQueue('personal_budget', budget.id, existing ? 'UPDATE' : 'INSERT', budget);
  return budget;
}

export async function getMonthlyExpenseTotal(userId: string, monthKey = getCurrentMonthKey()): Promise<number> {
  const [year, month] = monthKey.split('-').map(Number);
  const rows = await db.personal_expenses.where('user_id').equals(userId).toArray();
  return rows
    .filter((row) => {
      if (row.type !== 'expense') return false;
      const date = new Date(row.created_at);
      return date.getFullYear() === year && date.getMonth() + 1 === month;
    })
    .reduce((acc, row) => acc + row.amount, 0);
}
