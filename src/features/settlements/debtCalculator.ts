import type { Expense, ExpenseShare, Settlement } from '../../core/db';

export interface Transfer {
  from_user: string;
  to_user: string;
  amount: number;
}

export interface UserBalance {
  user_id: string;
  paid: number;
  share: number;
  net: number;
}

/**
 * Calcula los balances netos de cada usuario en base a lo aportado y sus participaciones de gasto.
 */
export function calculateBalances(
  memberIds: string[],
  expenses: Expense[],
  shares: ExpenseShare[],
  settlements: Settlement[]
): UserBalance[] {
  const balances: Record<string, { paid: number; share: number }> = {};
  
  // Inicializar
  memberIds.forEach((id) => {
    balances[id] = { paid: 0, share: 0 };
  });

  // Sumar lo pagado por cada usuario
  expenses.forEach((exp) => {
    if (balances[exp.user_id] !== undefined) {
      balances[exp.user_id].paid += exp.amount;
    } else {
      balances[exp.user_id] = { paid: exp.amount, share: 0 };
    }
  });

  // Sumar las partes correspondientes a cada usuario
  shares.forEach((share) => {
    if (balances[share.user_id] !== undefined) {
      balances[share.user_id].share += share.share_amount;
    } else {
      balances[share.user_id] = { paid: 0, share: share.share_amount };
    }
  });

  // Ajustar saldos según transferencias ya realizadas (acuerdos liquidados)
  settlements.forEach((set) => {
    if (set.status === 'settled') {
      if (balances[set.from_user] !== undefined) {
        // El deudor suma a su "aportado" porque pagó su parte directamente
        balances[set.from_user].paid += set.amount;
      }
      if (balances[set.to_user] !== undefined) {
        // El acreedor resta de su "aportado" porque ya recuperó su dinero
        balances[set.to_user].paid -= set.amount;
      }
    }
  });

  return Object.keys(balances).map((userId) => {
    const paid = balances[userId].paid;
    const share = balances[userId].share;
    return {
      user_id: userId,
      paid,
      share,
      net: parseFloat((paid - share).toFixed(2))
    };
  });
}

/**
 * Calcula las transferencias mínimas necesarias utilizando un algoritmo greedy (codicioso).
 * Optimiza la liquidación emparejando deudores máximos con acreedores máximos.
 */
export function calculateOptimalTransfers(userBalances: UserBalance[]): Transfer[] {
  // Filtrar saldos significativos (mayores a $0.01 de deuda o crédito)
  const debtors = userBalances
    .filter((b) => b.net < -0.01)
    .map((b) => ({ ...b, net: Math.abs(b.net) }))
    .sort((a, b) => b.net - a.net); // Ordenados de mayor deuda a menor

  const creditors = userBalances
    .filter((b) => b.net > 0.01)
    .map((b) => ({ ...b }))
    .sort((a, b) => b.net - a.net); // Ordenados de mayor crédito a menor

  const transfers: Transfer[] = [];

  let i = 0; // puntero deudores
  let j = 0; // puntero acreedores

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];

    const amount = parseFloat(Math.min(debtor.net, creditor.net).toFixed(2));
    
    if (amount > 0) {
      transfers.push({
        from_user: debtor.user_id,
        to_user: creditor.user_id,
        amount
      });
      
      debtor.net = parseFloat((debtor.net - amount).toFixed(2));
      creditor.net = parseFloat((creditor.net - amount).toFixed(2));
    }

    if (debtor.net <= 0.01) i++;
    if (creditor.net <= 0.01) j++;
  }

  return transfers;
}
