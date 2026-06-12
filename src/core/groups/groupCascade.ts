import { db } from '../db';
import { addToSyncQueue } from '../sync/syncEngine';

// Elimina un evento y todas sus entidades relacionadas
export async function deleteEventCascade(eventId: string): Promise<void> {
  const expenses = await db.expenses.where('event_id').equals(eventId).toArray();

  for (const expense of expenses) {
    const shares = await db.expense_shares.where('expense_id').equals(expense.id).toArray();
    for (const share of shares) {
      await db.expense_shares.delete(share.id);
      await addToSyncQueue('expense_share', share.id, 'DELETE', { id: share.id });
    }
    await db.expenses.delete(expense.id);
    await addToSyncQueue('expense', expense.id, 'DELETE', { id: expense.id });
  }

  const settlements = await db.settlements.where('event_id').equals(eventId).toArray();
  for (const settlement of settlements) {
    await db.settlements.delete(settlement.id);
    await addToSyncQueue('settlement', settlement.id, 'DELETE', { id: settlement.id });
  }

  await db.events.delete(eventId);
  await addToSyncQueue('event', eventId, 'DELETE', { id: eventId });
}

// Elimina un grupo completo con eventos, gastos y membresías
export async function deleteGroupCascade(groupId: string): Promise<void> {
  const events = await db.events.where('group_id').equals(groupId).toArray();
  for (const event of events) {
    await deleteEventCascade(event.id);
  }

  const members = await db.group_members.where('group_id').equals(groupId).toArray();
  for (const member of members) {
    await db.group_members.delete(member.id);
    await addToSyncQueue('group_member', member.id, 'DELETE', { id: member.id });
  }

  await db.groups.delete(groupId);
  await addToSyncQueue('group', groupId, 'DELETE', { id: groupId });
}

// Abandona un grupo eliminando solo la membresía del usuario actual
export async function leaveGroupMembership(memberId: string): Promise<void> {
  await db.group_members.delete(memberId);
  await addToSyncQueue('group_member', memberId, 'DELETE', { id: memberId });
}
