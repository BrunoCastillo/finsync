import React, { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type PersonalExpense } from '../../core/db';
import { useAuthStore } from '../../store/authStore';
import { useUiStore } from '../../store/uiStore';
import { Card, Button, Input, Modal, Badge } from '../../components/UI';
import { addToSyncQueue, generateUUID } from '../../core/sync/syncEngine';
import { validateAmount } from '../../core/validation';
import { Plus, Pencil, Trash2, DollarSign, TrendingDown, TrendingUp, Wallet } from 'lucide-react';

const CATEGORIES = ['Alimentación', 'Transporte', 'Vivienda', 'Salud', 'Educación', 'Entretenimiento', 'Viajes', 'Otros'];

const CATEGORY_ICONS: Record<string, string> = {
  Alimentación: '🍔',
  Transporte: '🚗',
  Vivienda: '🏠',
  Salud: '🩺',
  Educación: '📚',
  Entretenimiento: '🍿',
  Viajes: '✈️',
  Otros: '💰'
};

function isCurrentMonth(dateIso: string): boolean {
  const date = new Date(dateIso);
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

export const PersonalExpensesFeature: React.FC = () => {
  const { currentUser } = useAuthStore();
  const { openPersonalFormOnNavigate, clearPersonalFormIntent } = useUiStore();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<PersonalExpense | null>(null);
  const [description, setDescription] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [category, setCategory] = useState('Alimentación');
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [error, setError] = useState('');

  const personalExpenses = useLiveQuery(async () => {
    if (!currentUser) return [];
    return db.personal_expenses
      .where('user_id')
      .equals(currentUser.id)
      .reverse()
      .sortBy('created_at');
  }, [currentUser]);

  const monthStats = useLiveQuery(async () => {
    if (!currentUser) return { expenses: 0, income: 0, balance: 0 };
    const rows = await db.personal_expenses.where('user_id').equals(currentUser.id).toArray();
    const monthRows = rows.filter((row) => isCurrentMonth(row.created_at));
    const expenses = monthRows
      .filter((row) => row.type === 'expense')
      .reduce((acc, row) => acc + row.amount, 0);
    const income = monthRows
      .filter((row) => row.type === 'income')
      .reduce((acc, row) => acc + row.amount, 0);
    return { expenses, income, balance: income - expenses };
  }, [currentUser]);

  useEffect(() => {
    if (openPersonalFormOnNavigate) {
      setEditingExpense(null);
      setIsFormOpen(true);
      clearPersonalFormIntent();
    }
  }, [openPersonalFormOnNavigate, clearPersonalFormIntent]);

  const resetForm = () => {
    setDescription('');
    setAmountStr('');
    setCategory('Alimentación');
    setType('expense');
    setError('');
    setEditingExpense(null);
  };

  const handleOpenCreate = () => {
    resetForm();
    setIsFormOpen(true);
  };

  const handleOpenEdit = (expense: PersonalExpense) => {
    setEditingExpense(expense);
    setDescription(expense.description);
    setAmountStr(String(expense.amount));
    setCategory(expense.category);
    setType(expense.type);
    setError('');
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    resetForm();
  };

  const handleDelete = async (expense: PersonalExpense) => {
    const confirmed = window.confirm(
      `¿Eliminar ${expense.type === 'expense' ? 'gasto' : 'ingreso'} "${expense.description}" por $${expense.amount.toFixed(2)}?`
    );
    if (!confirmed) return;

    await db.personal_expenses.delete(expense.id);
    await addToSyncQueue('personal_expense', expense.id, 'DELETE', { id: expense.id });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (!currentUser) return;

    const amount = parseFloat(amountStr);
    const amountValidation = validateAmount({ amount });
    if (!amountValidation.is_valid) {
      setError(amountValidation.error);
      return;
    }

    if (!description.trim()) {
      setError('Ingresa una descripción.');
      return;
    }

    if (description.trim().length > 120) {
      setError('La descripción no puede superar 120 caracteres.');
      return;
    }

    try {
      if (editingExpense) {
        const updatedExpense: PersonalExpense = {
          ...editingExpense,
          amount,
          description: description.trim(),
          category,
          type
        };
        await db.personal_expenses.put(updatedExpense);
        await addToSyncQueue('personal_expense', editingExpense.id, 'UPDATE', updatedExpense);
      } else {
        const newExpense: PersonalExpense = {
          id: generateUUID(),
          user_id: currentUser.id,
          amount,
          description: description.trim(),
          category,
          type,
          created_at: new Date().toISOString()
        };
        await db.personal_expenses.add(newExpense);
        await addToSyncQueue('personal_expense', newExpense.id, 'INSERT', newExpense);
      }

      handleCloseForm();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Error al guardar: ${message}`);
    }
  };

  if (!currentUser) {
    return (
      <div style={{ textAlign: 'center', padding: '48px' }}>
        <p>Inicia sesión para gestionar tus gastos personales.</p>
      </div>
    );
  }

  const monthExpenses = monthStats?.expenses ?? 0;
  const monthIncome = monthStats?.income ?? 0;
  const monthBalance = monthStats?.balance ?? 0;

  return (
    <div className="animate-fade-in">
      <div className="app-header" style={{ flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 800 }}>Gastos Personales</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
            Controla tus finanzas individuales: gastos e ingresos del mes.
          </p>
        </div>
        <Button onClick={handleOpenCreate} icon={<Plus size={16} />}>
          Nuevo movimiento
        </Button>
      </div>

      <div className="grid-3 mb-24">
        <Card style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ padding: '12px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--danger-light)', color: 'var(--danger)' }}>
            <TrendingDown size={24} />
          </div>
          <div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Gastos del mes</p>
            <p style={{ fontSize: '24px', fontWeight: 700 }}>${monthExpenses.toFixed(2)}</p>
          </div>
        </Card>
        <Card style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ padding: '12px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--secondary-light)', color: 'var(--secondary)' }}>
            <TrendingUp size={24} />
          </div>
          <div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Ingresos del mes</p>
            <p style={{ fontSize: '24px', fontWeight: 700 }}>${monthIncome.toFixed(2)}</p>
          </div>
        </Card>
        <Card style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ padding: '12px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--primary-light)', color: 'var(--primary)' }}>
            <Wallet size={24} />
          </div>
          <div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Balance mensual</p>
            <p style={{ fontSize: '24px', fontWeight: 700, color: monthBalance >= 0 ? 'var(--secondary)' : 'var(--danger)' }}>
              {monthBalance >= 0 ? '+' : ''}${monthBalance.toFixed(2)}
            </p>
          </div>
        </Card>
      </div>

      {!personalExpenses || personalExpenses.length === 0 ? (
        <Card glass className="text-center" style={{ padding: '48px' }}>
          <Wallet size={48} style={{ color: 'var(--text-secondary)', marginBottom: '16px' }} />
          <h3>Sin movimientos personales</h3>
          <p style={{ color: 'var(--text-secondary)', marginTop: '8px', marginBottom: '16px' }}>
            Registra tu primer gasto o ingreso personal.
          </p>
          <Button onClick={handleOpenCreate} icon={<Plus size={16} />}>
            Registrar movimiento
          </Button>
        </Card>
      ) : (
        <div className="list-container">
          {personalExpenses.map((expense) => (
            <Card key={expense.id} style={{ padding: '16px 20px' }}>
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
                    {CATEGORY_ICONS[expense.category] ?? '💰'}
                  </div>
                  <div>
                    <p style={{ fontWeight: 700, fontSize: '16px' }}>{expense.description}</p>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      {new Date(expense.created_at).toLocaleDateString()} · {expense.category}
                    </p>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                  <p
                    style={{
                      fontSize: '18px',
                      fontWeight: 700,
                      color: expense.type === 'income' ? 'var(--secondary)' : 'var(--danger)'
                    }}
                  >
                    {expense.type === 'income' ? '+' : '-'}${expense.amount.toFixed(2)}
                  </p>
                  <Badge variant={expense.type === 'income' ? 'emerald' : 'rose'} style={{ fontSize: '10px' }}>
                    {expense.type === 'income' ? 'Ingreso' : 'Gasto'}
                  </Badge>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                    <Button
                      variant="secondary"
                      onClick={() => handleOpenEdit(expense)}
                      icon={<Pencil size={14} />}
                      style={{ padding: '6px 10px', fontSize: '12px' }}
                    >
                      Editar
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => handleDelete(expense)}
                      icon={<Trash2 size={14} />}
                      style={{ padding: '6px 10px', fontSize: '12px' }}
                    >
                      Eliminar
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        isOpen={isFormOpen}
        onClose={handleCloseForm}
        title={editingExpense ? 'Editar movimiento personal' : 'Nuevo movimiento personal'}
      >
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="form-group">
            <label className="form-label">Tipo</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button
                type="button"
                className="btn"
                onClick={() => setType('expense')}
                style={{
                  padding: '10px',
                  background: type === 'expense' ? 'var(--danger-light)' : 'rgba(255,255,255,0.03)',
                  border: type === 'expense' ? '1px solid var(--danger)' : '1px solid var(--border-glass)',
                  color: type === 'expense' ? 'var(--text-primary)' : 'var(--text-secondary)'
                }}
              >
                Gasto
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setType('income')}
                style={{
                  padding: '10px',
                  background: type === 'income' ? 'var(--secondary-light)' : 'rgba(255,255,255,0.03)',
                  border: type === 'income' ? '1px solid var(--secondary)' : '1px solid var(--border-glass)',
                  color: type === 'income' ? 'var(--text-primary)' : 'var(--text-secondary)'
                }}
              >
                Ingreso
              </button>
            </div>
          </div>

          <Input
            label="Descripción"
            placeholder="ej. Supermercado, Salario freelance"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '12px' }}>
            <Input
              label="Monto ($)"
              type="number"
              step="0.01"
              placeholder="0.00"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              required
              icon={<DollarSign size={16} />}
            />
            <div className="form-group">
              <label className="form-label">Categoría</label>
              <select className="input-field" value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && (
            <p style={{ color: 'var(--danger)', fontSize: '13px', textAlign: 'center', fontWeight: 500 }}>
              {error}
            </p>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
            <Button type="button" variant="secondary" onClick={handleCloseForm}>
              Cancelar
            </Button>
            <Button type="submit" icon={<DollarSign size={16} />}>
              {editingExpense ? 'Actualizar' : 'Guardar'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
