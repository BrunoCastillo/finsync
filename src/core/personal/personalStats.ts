import { db, type PersonalExpense } from '../db';

export interface PersonalMonthSummary {
  expenses: number;
  income: number;
  balance: number;
  count: number;
  byCategory: Record<string, number>;
  recentMovements: PersonalExpense[];
}

function isCurrentMonth(dateIso: string): boolean {
  const date = new Date(dateIso);
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

// Resumen mensual de movimientos personales para dashboard y reportes
export async function getPersonalMonthSummary(userId: string): Promise<PersonalMonthSummary> {
  const rows = await db.personal_expenses.where('user_id').equals(userId).toArray();
  const monthRows = rows.filter((row) => isCurrentMonth(row.created_at));
  const expenses = monthRows
    .filter((row) => row.type === 'expense')
    .reduce((acc, row) => acc + row.amount, 0);
  const income = monthRows
    .filter((row) => row.type === 'income')
    .reduce((acc, row) => acc + row.amount, 0);

  const byCategory: Record<string, number> = {};
  monthRows
    .filter((row) => row.type === 'expense')
    .forEach((row) => {
      byCategory[row.category] = (byCategory[row.category] || 0) + row.amount;
    });

  const recentMovements = [...monthRows]
    .sort((left, right) => right.created_at.localeCompare(left.created_at))
    .slice(0, 5);

  return {
    expenses,
    income,
    balance: income - expenses,
    count: monthRows.length,
    byCategory,
    recentMovements
  };
}
