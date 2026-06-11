import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Settlement, type Expense, type ExpenseShare } from '../../core/db';
import { useAuthStore } from '../../store/authStore';
import { useUiStore } from '../../store/uiStore';
import { Card, Button, Badge } from '../../components/UI';
import { ExpensesFeature } from '../expenses/ExpensesFeature';
import { calculateBalances, calculateOptimalTransfers } from '../settlements/debtCalculator';
import { addToSyncQueue, generateUUID } from '../../core/sync/syncEngine';
import { ChevronLeft, Plus, DollarSign, Wallet, RefreshCw, CheckCircle2, Lock, Unlock, CreditCard, Pencil, Trash2 } from 'lucide-react';
import confetti from 'canvas-confetti';

export const EventDetailFeature: React.FC = () => {
  const { currentUser, allUsers } = useAuthStore();
  const { selectedGroupId, selectedEventId, setView, openExpenseFormOnNavigate, clearExpenseFormIntent } = useUiStore();
  
  const [activeTab, setActiveTab] = useState<'expenses' | 'balances'>('expenses');
  const [isExpenseFormOpen, setIsExpenseFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editingShares, setEditingShares] = useState<ExpenseShare[]>([]);

  // Queries reactivas usando Dexie
  const event = useLiveQuery(async () => {
    if (!selectedEventId) return null;
    return db.events.get(selectedEventId);
  }, [selectedEventId]);

  useEffect(() => {
    if (openExpenseFormOnNavigate && event?.status === 'open') {
      setIsExpenseFormOpen(true);
      setActiveTab('expenses');
      clearExpenseFormIntent();
    }
  }, [openExpenseFormOnNavigate, event, clearExpenseFormIntent]);

  const groupMembers = useLiveQuery(async () => {
    if (!selectedGroupId) return [];
    const members = await db.group_members.where('group_id').equals(selectedGroupId).toArray();
    const result = [];
    for (const m of members) {
      const user = await db.users.get(m.user_id);
      if (user) {
        result.push({ user, role: m.role });
      }
    }
    return result;
  }, [selectedGroupId]);

  const expenses = useLiveQuery(async () => {
    if (!selectedEventId) return [];
    return db.expenses.where('event_id').equals(selectedEventId).reverse().sortBy('created_at');
  }, [selectedEventId]);

  const expenseShares = useLiveQuery(async () => {
    if (!expenses || expenses.length === 0) return [];
    const expenseIds = expenses.map(e => e.id);
    return db.expense_shares.where('expense_id').anyOf(expenseIds).toArray();
  }, [expenses]);

  const settlements = useLiveQuery(async () => {
    if (!selectedEventId) return [];
    return db.settlements.where('event_id').equals(selectedEventId).toArray();
  }, [selectedEventId]);

  // Cálculos matemáticos
  const totalSpent = expenses ? expenses.reduce((acc, curr) => acc + curr.amount, 0) : 0;

  const memberIds = groupMembers ? groupMembers.map(m => m.user.id) : [];
  const userBalances = (memberIds.length > 0 && expenses && expenseShares && settlements)
    ? calculateBalances(memberIds, expenses, expenseShares, settlements)
    : [];

  const optimalTransfers = userBalances.length > 0 ? calculateOptimalTransfers(userBalances) : [];

  // Saldo total liquidado ya
  const totalSettled = settlements 
    ? settlements.filter(s => s.status === 'settled').reduce((acc, curr) => acc + curr.amount, 0)
    : 0;

  // Manejo de Liquidar Deuda individual
  const handleSettleTransfer = async (fromUserId: string, toUserId: string, amount: number) => {
    if (!selectedEventId) return;

    const settlementId = generateUUID();
    const newSettlement: Settlement = {
      id: settlementId,
      event_id: selectedEventId,
      from_user: fromUserId,
      to_user: toUserId,
      amount,
      status: 'settled',
      created_at: new Date().toISOString()
    };

    await db.settlements.add(newSettlement);
    await addToSyncQueue('settlement', settlementId, 'INSERT', newSettlement);

    // Lanzar confeti para gamificar la experiencia de usuario
    confetti({
      particleCount: 150,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#7c3aed', '#10b981', '#6366f1']
    });

    // Crear notificaciones correspondientes
    const debtorUser = allUsers.find(u => u.id === fromUserId);

    // Notificación para el acreedor
    const notif1Id = generateUUID();
    const notif1 = {
      id: notif1Id,
      user_id: toUserId,
      message: `${debtorUser?.name || 'Un deudor'} te pagó $${amount} para saldar su deuda en "${event?.name}"`,
      read: 0,
      created_at: new Date().toISOString()
    };
    await db.notifications.add(notif1);
    await addToSyncQueue('notification', notif1Id, 'INSERT', notif1);
  };

  const handleToggleEventStatus = async () => {
    if (!event) return;
    const newStatus = event.status === 'open' ? 'closed' : 'open';
    
    await db.events.update(event.id, { status: newStatus });
    await addToSyncQueue('event', event.id, 'UPDATE', { status: newStatus });

    // Lanzar confeti si se cierra exitosamente como celebración
    if (newStatus === 'closed') {
      confetti({
        particleCount: 100,
        spread: 100,
        origin: { y: 0.5 }
      });
    }
  };

  const handleCloseExpenseForm = () => {
    setIsExpenseFormOpen(false);
    setEditingExpense(null);
    setEditingShares([]);
  };

  const handleEditExpense = (expense: Expense, shares: ExpenseShare[]) => {
    setEditingExpense(expense);
    setEditingShares(shares);
    setIsExpenseFormOpen(true);
  };

  const handleDeleteExpense = async (expense: Expense) => {
    const confirmed = window.confirm(
      `¿Eliminar el gasto "${expense.description}" por $${expense.amount.toFixed(2)}?`
    );
    if (!confirmed) return;

    const shares = await db.expense_shares.where('expense_id').equals(expense.id).toArray();

    await db.transaction('rw', db.expenses, db.expense_shares, async () => {
      await db.expense_shares.where('expense_id').equals(expense.id).delete();
      await db.expenses.delete(expense.id);
    });

    await addToSyncQueue('expense', expense.id, 'DELETE', { id: expense.id });
    for (const share of shares) {
      await addToSyncQueue('expense_share', share.id, 'DELETE', { id: share.id });
    }
  };

  const getUserDetails = (userId: string) => {
    const user = allUsers.find(u => u.id === userId);
    return user ? { name: user.name, avatar: user.avatar } : { name: 'Usuario', avatar: '👤' };
  };

  if (!event || !selectedGroupId) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <Button variant="secondary" onClick={() => setView('groups')} icon={<ChevronLeft size={16} />}>
          Volver a Grupos
        </Button>
        <p>Cargando evento...</p>
      </div>
    );
  }

  const isEventOpen = event.status === 'open';

  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: '24px' }}>
        <Button variant="secondary" onClick={() => setView('group-detail', selectedGroupId)} icon={<ChevronLeft size={16} />}>
          Volver al Grupo
        </Button>
      </div>

      {/* Cabecera del Evento */}
      <div className="app-header" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h1 style={{ fontSize: '28px', fontWeight: 800 }}>{event.name}</h1>
            <Badge variant={isEventOpen ? 'emerald' : 'rose'}>
              {isEventOpen ? 'Abierto' : 'Liquidado'}
            </Badge>
          </div>
          <p style={{ color: 'var(--text-secondary)', marginTop: '4px', fontSize: '14px' }}>
            Creado el {new Date(event.created_at).toLocaleDateString()}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          {isEventOpen ? (
            <>
              <Button
                onClick={() => {
                  setEditingExpense(null);
                  setEditingShares([]);
                  setIsExpenseFormOpen(true);
                }}
                icon={<Plus size={16} />}
              >
                Registrar Gasto
              </Button>
              <Button variant="secondary" onClick={handleToggleEventStatus} icon={<Lock size={16} />}>
                Cerrar Evento
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={handleToggleEventStatus} icon={<Unlock size={16} />}>
              Reabrir Evento
            </Button>
          )}
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid-3 mb-24">
        <Card style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ padding: '12px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--primary-light)', color: 'var(--primary)' }}>
            <DollarSign size={24} />
          </div>
          <div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Total Gastado</p>
            <p style={{ fontSize: '24px', fontWeight: 700 }}>${totalSpent.toFixed(2)}</p>
          </div>
        </Card>

        <Card style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ padding: '12px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--secondary-light)', color: 'var(--secondary)' }}>
            <CheckCircle2 size={24} />
          </div>
          <div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Saldado total</p>
            <p style={{ fontSize: '24px', fontWeight: 700 }}>${totalSettled.toFixed(2)}</p>
          </div>
        </Card>

        <Card style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ padding: '12px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--warning-light)', color: 'var(--warning)' }}>
            <Wallet size={24} />
          </div>
          <div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Deudas pendientes</p>
            <p style={{ fontSize: '24px', fontWeight: 700 }}>
              {optimalTransfers.length} transacciones
            </p>
          </div>
        </Card>
      </div>

      {/* Navegación por pestañas */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-glass)', marginBottom: '24px' }}>
        <button
          onClick={() => setActiveTab('expenses')}
          style={{
            padding: '12px 24px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'expenses' ? '3px solid var(--primary)' : '3px solid transparent',
            color: activeTab === 'expenses' ? 'var(--text-primary)' : 'var(--text-secondary)',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'var(--transition-fast)'
          }}
        >
          Gastos ({expenses?.length || 0})
        </button>
        <button
          onClick={() => setActiveTab('balances')}
          style={{
            padding: '12px 24px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'balances' ? '3px solid var(--primary)' : '3px solid transparent',
            color: activeTab === 'balances' ? 'var(--text-primary)' : 'var(--text-secondary)',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'var(--transition-fast)'
          }}
        >
          Balances & Liquidación
        </button>
      </div>

      {/* Pestaña: Gastos */}
      {activeTab === 'expenses' && (
        <div className="animate-fade-in">
          {expenses && expenses.length === 0 ? (
            <Card glass className="text-center" style={{ padding: '48px' }}>
              <CreditCard size={48} style={{ color: 'var(--text-secondary)', marginBottom: '16px' }} />
              <h3>No hay gastos en este evento</h3>
              <p style={{ color: 'var(--text-secondary)', marginTop: '8px', marginBottom: '16px' }}>
                Registra un gasto para comenzar a dividir las cuentas.
              </p>
              {isEventOpen && (
                <Button
                  onClick={() => {
                    setEditingExpense(null);
                    setEditingShares([]);
                    setIsExpenseFormOpen(true);
                  }}
                  icon={<Plus size={16} />}
                >
                  Registrar Primer Gasto
                </Button>
              )}
            </Card>
          ) : (
            <div className="list-container">
              {expenses?.map((exp) => {
                const payer = getUserDetails(exp.user_id);
                // Obtener las particiones de este gasto
                const shares = expenseShares ? expenseShares.filter(s => s.expense_id === exp.id) : [];
                return (
                  <Card key={exp.id} style={{ padding: '16px 20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div
                          style={{
                            width: '44px',
                            height: '44px',
                            borderRadius: 'var(--radius-md)',
                            backgroundColor: 'rgba(255,255,255,0.03)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '18px',
                            border: '1px solid var(--border-glass)'
                          }}
                        >
                          {exp.category === 'Alimentación' ? '🍔' :
                           exp.category === 'Transporte' ? '🚗' :
                           exp.category === 'Vivienda' ? '🏠' :
                           exp.category === 'Salud' ? '🩺' :
                           exp.category === 'Educación' ? '📚' :
                           exp.category === 'Entretenimiento' ? '🍿' :
                           exp.category === 'Viajes' ? '✈️' : '💰'}
                        </div>
                        <div>
                          <p style={{ fontWeight: 700, fontSize: '16px' }}>{exp.description}</p>
                          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                            <span>Pagado por: {payer.avatar} {payer.name}</span>
                            <span>&bull;</span>
                            <span>{new Date(exp.created_at).toLocaleDateString()}</span>
                          </p>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                        <p style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
                          ${exp.amount.toFixed(2)}
                        </p>
                        <Badge variant="purple" style={{ fontSize: '10px' }}>{exp.category}</Badge>
                        {isEventOpen && (
                          <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                            <Button
                              variant="secondary"
                              onClick={() => handleEditExpense(exp, shares)}
                              icon={<Pencil size={14} />}
                              style={{ padding: '6px 10px', fontSize: '12px' }}
                            >
                              Editar
                            </Button>
                            <Button
                              variant="danger"
                              onClick={() => handleDeleteExpense(exp)}
                              icon={<Trash2 size={14} />}
                              style={{ padding: '6px 10px', fontSize: '12px' }}
                            >
                              Eliminar
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Mostrar cómo se dividió el gasto */}
                    {shares.length > 0 && (
                      <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px dashed var(--border-glass)' }}>
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 600 }}>
                          DIVISIÓN DEL GASTO:
                        </p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
                          {shares.map((sh) => {
                            const u = getUserDetails(sh.user_id);
                            return (
                              <div key={sh.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                                <span>{u.avatar}</span>
                                <span style={{ color: 'var(--text-secondary)' }}>{u.name}:</span>
                                <span style={{ fontWeight: 600 }}>${sh.share_amount.toFixed(2)}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Pestaña: Balances y Liquidación */}
      {activeTab === 'balances' && (
        <div className="grid-2 animate-fade-in">
          {/* Balance Neto de los Miembros */}
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '16px' }}>Balance de Miembros</h2>
            <Card style={{ padding: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {userBalances.map((bal) => {
                  const u = getUserDetails(bal.user_id);
                  const isPositive = bal.net > 0;
                  const isZero = Math.abs(bal.net) <= 0.01;
                  
                  return (
                    <div key={bal.user_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '24px' }}>{u.avatar}</span>
                        <div>
                          <p style={{ fontWeight: 600, fontSize: '14px' }}>{u.name}</p>
                          <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            Aportó: ${bal.paid.toFixed(2)} | Su parte: ${bal.share.toFixed(2)}
                          </p>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span
                          style={{
                            fontWeight: 700,
                            fontSize: '15px',
                            color: isZero ? 'var(--text-muted)' : isPositive ? 'var(--secondary)' : 'var(--danger)'
                          }}
                        >
                          {isZero ? '$0.00' : `${isPositive ? '+' : ''}$${bal.net.toFixed(2)}`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>

          {/* Liquidación Óptima (Saldar Cuentas) */}
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '16px' }}>Liquidación Óptima</h2>
            
            {optimalTransfers.length === 0 ? (
              <Card glass className="text-center" style={{ padding: '32px' }}>
                <CheckCircle2 size={40} style={{ color: 'var(--secondary)', marginBottom: '12px' }} />
                <h3 style={{ fontSize: '16px' }}>¡Cuentas saldadas!</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '6px' }}>
                  No hay deudas pendientes en este evento. Todo está perfectamente cuadrado.
                </p>
              </Card>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {optimalTransfers.map((trans, idx) => {
                  const debtor = getUserDetails(trans.from_user);
                  const creditor = getUserDetails(trans.to_user);

                  const isCurrentUserDebtor = trans.from_user === currentUser?.id;

                  return (
                    <Card
                      key={idx}
                      glass
                      style={{
                        padding: '16px',
                        borderLeft: '4px solid' + (isCurrentUserDebtor ? 'var(--danger)' : 'var(--primary)')
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', fontWeight: 500 }}>
                            <span style={{ fontWeight: 700 }}>{debtor.avatar} {debtor.name}</span>
                            <span style={{ color: 'var(--text-secondary)' }}>debe pagar a</span>
                            <span style={{ fontWeight: 700 }}>{creditor.avatar} {creditor.name}</span>
                          </div>
                          <p style={{ fontSize: '20px', fontWeight: 800, marginTop: '8px', color: 'var(--text-primary)' }}>
                            ${trans.amount.toFixed(2)}
                          </p>
                        </div>
                        {isEventOpen && (
                          <Button
                            variant={isCurrentUserDebtor ? 'danger' : 'success'}
                            onClick={() => handleSettleTransfer(trans.from_user, trans.to_user, trans.amount)}
                            icon={<RefreshCw size={14} />}
                            style={{ padding: '8px 12px', fontSize: '12px' }}
                          >
                            {isCurrentUserDebtor ? 'Yo pagué' : 'Saldar'}
                          </Button>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}

            {/* Acuerdos Completados */}
            {settlements && settlements.length > 0 && (
              <div style={{ marginTop: '24px' }}>
                <h3 style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '12px', fontWeight: 600 }}>
                  HISTORIAL DE TRANSFERENCIAS REALIZADAS:
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {settlements.map((set) => {
                    const fromU = getUserDetails(set.from_user);
                    const toU = getUserDetails(set.to_user);
                    return (
                      <div
                        key={set.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '10px 14px',
                          backgroundColor: 'rgba(255,255,255,0.01)',
                          border: '1px solid var(--border-glass)',
                          borderRadius: 'var(--radius-md)',
                          fontSize: '13px'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontWeight: 600 }}>{fromU.avatar} {fromU.name}</span>
                          <span style={{ color: 'var(--text-muted)' }}>pagó a</span>
                          <span style={{ fontWeight: 600 }}>{toU.avatar} {toU.name}</span>
                        </div>
                        <span style={{ color: 'var(--secondary)', fontWeight: 700 }}>
                          ${set.amount.toFixed(2)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Formulario Modal para Agregar Gasto */}
      <ExpensesFeature
        groupId={selectedGroupId}
        eventId={event.id}
        members={groupMembers || []}
        isOpen={isExpenseFormOpen}
        onClose={handleCloseExpenseForm}
        onSuccess={() => {
          setActiveTab('expenses');
          setEditingExpense(null);
          setEditingShares([]);
        }}
        editingExpense={editingExpense}
        existingShares={editingShares}
      />
    </div>
  );
};
