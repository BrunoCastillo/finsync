import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../core/db';
import { useAuthStore } from '../../store/authStore';
import { useUiStore } from '../../store/uiStore';
import { useSyncStore, triggerSync } from '../../core/sync/syncEngine';
import { Card, Button, Badge } from '../../components/UI';
import { DEMO_GROUP_ID, DEMO_EVENT_ID } from '../../core/seedDemoData';
import { getCurrentMonthKey, getMonthlyBudget } from '../../core/personal/budget';
import { Wifi, WifiOff, RefreshCw, Landmark, ArrowUpRight, ArrowDownLeft, AlertCircle, Plus, Wallet, Target } from 'lucide-react';

export const DashboardFeature: React.FC = () => {
  const { currentUser } = useAuthStore();
  const { setView } = useUiStore();

  const handleRegisterGroupExpense = async () => {
    if (!currentUser) return;

    const demoEvent = await db.events.get(DEMO_EVENT_ID);
    const demoMembership = await db.group_members
      .where('[group_id+user_id]')
      .equals([DEMO_GROUP_ID, currentUser.id])
      .first();

    if (demoEvent?.status === 'open' && demoMembership) {
      setView('event-detail', DEMO_GROUP_ID, DEMO_EVENT_ID, true);
      return;
    }

    const memberships = await db.group_members.where('user_id').equals(currentUser.id).toArray();
    for (const membership of memberships) {
      const events = await db.events.where('group_id').equals(membership.group_id).toArray();
      const openEvent = events.find((event) => event.status === 'open');
      if (openEvent) {
        setView('event-detail', membership.group_id, openEvent.id, true);
        return;
      }
    }

    setView('groups');
  };

  const handleRegisterPersonalExpense = () => {
    setView('personal', null, null, false, true);
  };
  // Sync state
  const { isOnline, isSyncing, pendingCount, syncHistory, setOnline } = useSyncStore();

  // Queries reactivas usando Dexie
  const userEventIds = useLiveQuery(async () => {
    if (!currentUser) return new Set<string>();

    const memberships = await db.group_members.where('user_id').equals(currentUser.id).toArray();
    const groupIds = memberships.map((membership) => membership.group_id);
    if (groupIds.length === 0) return new Set<string>();

    const events = await db.events.where('group_id').anyOf(groupIds).toArray();
    return new Set(events.map((event) => event.id));
  }, [currentUser]);

  const totalExpensesCount = useLiveQuery(async () => {
    if (!currentUser) return 0;
    const eventIds = userEventIds ?? new Set<string>();
    if (eventIds.size === 0) return 0;

    const expenses = await db.expenses.toArray();
    return expenses.filter((expense) => eventIds.has(expense.event_id)).length;
  }, [currentUser, userEventIds]);

  const totalGroupsCount = useLiveQuery(async () => {
    if (!currentUser) return 0;
    return db.group_members.where('user_id').equals(currentUser.id).count();
  }, [currentUser]);

  const personalMonthStats = useLiveQuery(async () => {
    if (!currentUser) return { expenses: 0, income: 0, balance: 0, count: 0 };
    const rows = await db.personal_expenses.where('user_id').equals(currentUser.id).toArray();
    const now = new Date();
    const monthRows = rows.filter((row) => {
      const date = new Date(row.created_at);
      return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
    });
    const expenses = monthRows.filter((row) => row.type === 'expense').reduce((acc, row) => acc + row.amount, 0);
    const income = monthRows.filter((row) => row.type === 'income').reduce((acc, row) => acc + row.amount, 0);
    return { expenses, income, balance: income - expenses, count: monthRows.length };
  }, [currentUser]);

  const personalBudget = useLiveQuery(async () => {
    if (!currentUser) return undefined;
    return getMonthlyBudget(currentUser.id, getCurrentMonthKey());
  }, [currentUser]);

  // Cargar gastos grupales solo de eventos donde participa el usuario
  const expensesStats = useLiveQuery(async () => {
    if (!currentUser) return { totalPaid: 0, totalShare: 0, byCategory: {} as Record<string, number> };

    const eventIds = userEventIds ?? new Set<string>();
    if (eventIds.size === 0) {
      return { totalPaid: 0, totalShare: 0, byCategory: {} as Record<string, number> };
    }

    const groupExpenses = (await db.expenses.toArray()).filter((expense) =>
      eventIds.has(expense.event_id)
    );
    const expenseIds = new Set(groupExpenses.map((expense) => expense.id));

    const userPaid = groupExpenses
      .filter((expense) => expense.user_id === currentUser.id)
      .reduce((acc, expense) => acc + expense.amount, 0);

    const userShares = (await db.expense_shares.where('user_id').equals(currentUser.id).toArray())
      .filter((share) => expenseIds.has(share.expense_id));

    const userShareTotal = userShares.reduce((acc, share) => acc + share.share_amount, 0);

    const byCategory: Record<string, number> = {};
    groupExpenses.forEach((expense) => {
      if (expense.user_id === currentUser.id) {
        byCategory[expense.category] = (byCategory[expense.category] || 0) + expense.amount;
      }
    });

    return {
      totalPaid: userPaid,
      totalShare: userShareTotal,
      byCategory
    };
  }, [currentUser, userEventIds]);

  const totalPaid = expensesStats?.totalPaid || 0;
  const totalShare = expensesStats?.totalShare || 0;
  const netBalance = totalPaid - totalShare;
  const budgetLimit = personalBudget?.limit_amount ?? 0;
  const monthPersonalExpenses = personalMonthStats?.expenses ?? 0;
  const isOverPersonalBudget = budgetLimit > 0 && monthPersonalExpenses > budgetLimit;

  // Preparar datos para el gráfico SVG de Categorías
  const categoryData = expensesStats?.byCategory || {};
  const categoryKeys = Object.keys(categoryData);
  const totalPaidForCategories = Object.values(categoryData).reduce((a, b) => a + b, 0);

  const categoryColors: Record<string, string> = {
    Alimentación: '#f43f5e', // Rose
    Transporte: '#3b82f6', // Blue
    Vivienda: '#10b981', // Emerald
    Salud: '#a855f7', // Purple
    Educación: '#f59e0b', // Amber
    Entretenimiento: '#ec4899', // Pink
    Viajes: '#06b6d4', // Cyan
    Otros: '#64748b' // Slate
  };

  // Calcular offsets del SVG donut chart
  let accumulatedAngle = 0;
  const donutSegments = categoryKeys.map((cat) => {
    const val = categoryData[cat];
    const pct = totalPaidForCategories > 0 ? val / totalPaidForCategories : 0;
    const angle = pct * 360;
    const color = categoryColors[cat] || '#64748b';
    const startAngle = accumulatedAngle;
    accumulatedAngle += angle;
    return { cat, val, pct, startAngle, angle, color };
  });

  return (
    <div className="animate-fade-in">
      {/* Saludo y Simulación de Red */}
      <div className="app-header" style={{ flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 800 }}>
            Hola, {currentUser?.avatar} {currentUser?.name}
          </h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
            Este es el resumen general de tu billetera y deudas grupales.
            {' '}
            {(totalGroupsCount ?? 0) > 0 || (totalExpensesCount ?? 0) > 0 || (personalMonthStats?.count ?? 0) > 0
              ? `${totalGroupsCount ?? 0} grupos · ${totalExpensesCount ?? 0} gastos grupales · ${personalMonthStats?.count ?? 0} movimientos personales este mes.`
              : 'Crea un grupo o registra un gasto personal para empezar.'}
          </p>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
          <Button onClick={handleRegisterPersonalExpense} icon={<Wallet size={16} />}>
            Gasto personal
          </Button>
          <Button variant="secondary" onClick={handleRegisterGroupExpense} icon={<Plus size={16} />}>
            Gasto grupal
          </Button>

          {/* Panel Simulador de Red (Muy visual) */}
          <Card glass style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '16px', borderRadius: 'var(--radius-md)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {isOnline ? (
              <Wifi size={18} style={{ color: 'var(--secondary)' }} />
            ) : (
              <WifiOff size={18} style={{ color: 'var(--danger)' }} />
            )}
            <span style={{ fontSize: '13px', fontWeight: 600 }}>
              {isOnline ? 'EN LÍNEA' : 'SIN CONEXIÓN'}
            </span>
          </div>

          <button
            onClick={() => setOnline(!isOnline)}
            className="btn"
            style={{
              padding: '6px 12px',
              fontSize: '11px',
              backgroundColor: isOnline ? 'rgba(244,63,94,0.1)' : 'rgba(16,185,129,0.1)',
              color: isOnline ? 'var(--danger)' : 'var(--secondary)',
              border: '1px solid' + (isOnline ? 'var(--danger-light)' : 'var(--secondary-light)')
            }}
          >
            {isOnline ? 'Desconectar' : 'Conectar'}
          </button>
        </Card>
        </div>
      </div>

      {isOverPersonalBudget && (
        <Card
          style={{
            padding: '16px 20px',
            marginBottom: '24px',
            borderLeft: '4px solid var(--danger)',
            backgroundColor: 'rgba(244,63,94,0.06)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Target size={20} style={{ color: 'var(--danger)' }} />
            <div>
              <p style={{ fontWeight: 700, color: 'var(--danger)' }}>Presupuesto personal excedido</p>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Llevas ${monthPersonalExpenses.toFixed(2)} de ${budgetLimit.toFixed(2)} este mes.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Grid de Métricas Principales */}
      <div className="grid-3 mb-24">
        <Card style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ padding: '12px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--primary-light)', color: 'var(--primary)' }}>
            <Wallet size={24} />
          </div>
          <div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Balance personal (mes)</p>
            <p
              style={{
                fontSize: '24px',
                fontWeight: 700,
                color: (personalMonthStats?.balance ?? 0) >= 0 ? 'var(--secondary)' : 'var(--danger)'
              }}
            >
              {(personalMonthStats?.balance ?? 0) >= 0 ? '+' : ''}${(personalMonthStats?.balance ?? 0).toFixed(2)}
            </p>
          </div>
        </Card>

        <Card style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ padding: '12px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--secondary-light)', color: 'var(--secondary)' }}>
            <ArrowUpRight size={24} />
          </div>
          <div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Has Aportado Total</p>
            <p style={{ fontSize: '24px', fontWeight: 700 }}>${totalPaid.toFixed(2)}</p>
          </div>
        </Card>

        <Card style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ padding: '12px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--danger-light)', color: 'var(--danger)' }}>
            <ArrowDownLeft size={24} />
          </div>
          <div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Tu Gasto Consumido</p>
            <p style={{ fontSize: '24px', fontWeight: 700 }}>${totalShare.toFixed(2)}</p>
          </div>
        </Card>

        <Card
          style={{
            padding: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            borderLeft: '4px solid' + (netBalance >= 0 ? 'var(--secondary)' : 'var(--danger)')
          }}
        >
          <div
            style={{
              padding: '12px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: netBalance >= 0 ? 'var(--secondary-light)' : 'var(--danger-light)',
              color: netBalance >= 0 ? 'var(--secondary)' : 'var(--danger)'
            }}
          >
            <Landmark size={24} />
          </div>
          <div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Balance Neto Grupal</p>
            <p style={{ fontSize: '24px', fontWeight: 700, color: netBalance >= 0 ? 'var(--secondary)' : 'var(--danger)' }}>
              {netBalance >= 0 ? '+' : ''}${netBalance.toFixed(2)}
            </p>
          </div>
        </Card>
      </div>

      <div className="dashboard-grid">
        {/* Columna Izquierda: Gráfico de Categorías y Acciones Rápidas */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Gráfico SVG Donut */}
          <Card style={{ padding: '24px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '20px' }}>Mis Gastos por Categoría (Aportes)</h2>

            {totalPaidForCategories === 0 ? (
              <div style={{ textAlign: 'center', padding: '36px', color: 'var(--text-secondary)' }}>
                <p>No hay gastos registrados para generar gráficos.</p>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Ingresa a uno de tus grupos, abre un evento y registra tu primer gasto.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-around', gap: '24px' }}>
                {/* SVG Donut */}
                <div style={{ position: 'relative', width: '200px', height: '200px' }}>
                  <svg width="200" height="200" viewBox="0 0 200 200">
                    <circle cx="100" cy="100" r="80" fill="none" stroke="var(--bg-surface)" strokeWidth="24" />
                    {donutSegments.map((seg, idx) => {
                      // Usar stroke-dasharray y stroke-dashoffset para renderizar el donut
                      const radius = 70;
                      const circumference = 2 * Math.PI * radius;
                      const strokeDasharray = `${(seg.pct * circumference).toFixed(2)} ${circumference}`;
                      const strokeDashoffset = `${(- (seg.startAngle / 360) * circumference).toFixed(2)}`;
                      
                      return (
                        <circle
                          key={idx}
                          cx="100"
                          cy="100"
                          r={radius}
                          fill="none"
                          stroke={seg.color}
                          strokeWidth="20"
                          strokeDasharray={strokeDasharray}
                          strokeDashoffset={strokeDashoffset}
                          transform="rotate(-90 100 100)"
                          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
                        />
                      );
                    })}
                  </svg>
                  <div
                    style={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      textAlign: 'center',
                      width: '100px'
                    }}
                  >
                    <p style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600 }}>APORTES</p>
                    <p style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)' }}>
                      ${totalPaidForCategories.toFixed(0)}
                    </p>
                  </div>
                </div>

                {/* Leyenda */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, minWidth: '180px' }}>
                  {donutSegments.map((seg, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: seg.color, display: 'inline-block' }} />
                        <span style={{ color: 'var(--text-secondary)' }}>{seg.cat}</span>
                      </div>
                      <span style={{ fontWeight: 600 }}>
                        ${seg.val.toFixed(2)} ({(seg.pct * 100).toFixed(0)}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* Acciones Rápidas */}
          <Card style={{ padding: '24px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '16px' }}>Acciones Rápidas</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
              <Button onClick={() => setView('personal')} icon={<Wallet size={16} />}>
                Mis gastos personales
              </Button>
              <Button onClick={() => setView('groups')} icon={<Landmark size={16} />}>
                Gestionar Grupos
              </Button>
              <Button variant="secondary" onClick={() => setView('profile')} icon={<Landmark size={16} />}>
                Perfil & Demo
              </Button>
              <Button variant="secondary" onClick={() => setView('notifications')} icon={<Landmark size={16} />}>
                Ver Notificaciones
              </Button>
            </div>
          </Card>
        </div>

        {/* Columna Derecha: Cola de Sincronización y Logs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Cola de Sincronización Local-First */}
          <Card glass style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 700 }}>Cola de Sincronización</h2>
              <Badge variant={pendingCount > 0 ? 'amber' : 'emerald'}>
                {pendingCount > 0 ? `${pendingCount} pendientes` : 'Al día'}
              </Badge>
            </div>

            {pendingCount > 0 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px',
                  backgroundColor: 'var(--warning-light)',
                  border: '1px solid rgba(245,158,11,0.2)',
                  borderRadius: 'var(--radius-md)'
                }}
              >
                <AlertCircle size={20} style={{ color: 'var(--warning)', flexShrink: 0 }} />
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Hay cambios locales esperando a ser subidos a la nube. Se enviarán y descargarán automáticamente al reconectar.
                </p>
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px' }}>
              <Button
                variant="primary"
                onClick={triggerSync}
                disabled={!isOnline || isSyncing}
                icon={<RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />}
                style={{ width: '100%', padding: '10px 14px', fontSize: '13px' }}
              >
                {isSyncing ? 'Sincronizando...' : pendingCount > 0 ? 'Sincronizar ahora' : 'Descargar cambios'}
              </Button>
            </div>

            {/* Log de Sincronización */}
            <div style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '16px' }}>
              <h3 style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '10px', fontWeight: 600 }}>
                REGISTRO DE OPERACIONES (SYNC LOG):
              </h3>
              <div
                style={{
                  backgroundColor: 'rgba(0,0,0,0.3)',
                  border: '1px solid var(--border-glass)',
                  borderRadius: 'var(--radius-md)',
                  padding: '12px',
                  height: '180px',
                  overflowY: 'auto',
                  fontFamily: 'monospace',
                  fontSize: '11px',
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px'
                }}
              >
                {syncHistory.length === 0 ? (
                  <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Esperando operaciones...</span>
                ) : (
                  syncHistory.map((log, index) => (
                    <div key={index} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', paddingBottom: '2px' }}>
                      {log}
                    </div>
                  ))
                )}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
