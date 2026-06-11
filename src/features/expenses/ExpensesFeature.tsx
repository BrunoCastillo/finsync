import React, { useState, useEffect } from 'react';
import { db, type User, type Expense, type ExpenseShare } from '../../core/db';
import { useAuthStore } from '../../store/authStore';
import { Button, Input, Modal } from '../../components/UI';
import { addToSyncQueue, generateUUID } from '../../core/sync/syncEngine';
import { DollarSign, CheckSquare, Square } from 'lucide-react';

interface ExpensesFeatureProps {
  groupId: string;
  eventId: string;
  members: { user: User; role: string }[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type SplitType = 'equal' | 'percentage' | 'shares' | 'custom';

export const ExpensesFeature: React.FC<ExpensesFeatureProps> = ({
  eventId,
  members,
  isOpen,
  onClose,
  onSuccess
}) => {
  const { currentUser } = useAuthStore();
  const [description, setDescription] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [category, setCategory] = useState('Alimentación');
  const [payerId, setPayerId] = useState('');
  const [splitType, setSplitType] = useState<SplitType>('equal');

  // Participantes seleccionados (por defecto, todos)
  const [participants, setParticipants] = useState<Record<string, boolean>>({});
  // Valores para divisiones especiales
  const [splitValues, setSplitValues] = useState<Record<string, string>>({}); // Almacena %s, participaciones o montos exactos
  const [error, setError] = useState('');

  const categorias = ['Alimentación', 'Transporte', 'Vivienda', 'Salud', 'Educación', 'Entretenimiento', 'Viajes', 'Otros'];

  // Inicializar estados
  useEffect(() => {
    if (isOpen) {
      if (currentUser) {
        setPayerId(currentUser.id);
      } else if (members.length > 0) {
        setPayerId(members[0].user.id);
      }
      
      const initialParticipants: Record<string, boolean> = {};
      const initialValues: Record<string, string> = {};
      members.forEach((m) => {
        initialParticipants[m.user.id] = true;
        initialValues[m.user.id] = '';
      });
      
      setParticipants(initialParticipants);
      setSplitValues(initialValues);
      setDescription('');
      setAmountStr('');
      setCategory('Alimentación');
      setSplitType('equal');
      setError('');
    }
  }, [isOpen, members, currentUser]);

  const toggleParticipant = (userId: string) => {
    setParticipants((prev) => ({
      ...prev,
      [userId]: !prev[userId]
    }));
  };

  const handleValueChange = (userId: string, val: string) => {
    setSplitValues((prev) => ({
      ...prev,
      [userId]: val
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) {
      setError('Por favor, ingresa un monto válido mayor a 0.');
      return;
    }

    if (!description.trim()) {
      setError('Por favor, ingresa una descripción.');
      return;
    }

    const selectedUserIds = Object.keys(participants).filter((id) => participants[id]);
    if (selectedUserIds.length === 0) {
      setError('Debes seleccionar al menos un participante para dividir el gasto.');
      return;
    }

    // Calcular porciones e implementar validaciones según splitType
    const sharesToSave: { user_id: string; share_amount: number }[] = [];

    if (splitType === 'equal') {
      const shareAmount = parseFloat((amount / selectedUserIds.length).toFixed(2));
      let accumulated = 0;
      
      selectedUserIds.forEach((uid, index) => {
        // Para evitar problemas de redondeo de centavos, el último se lleva el ajuste
        let finalShare = shareAmount;
        if (index === selectedUserIds.length - 1) {
          finalShare = parseFloat((amount - accumulated).toFixed(2));
        } else {
          accumulated += shareAmount;
        }

        sharesToSave.push({
          user_id: uid,
          share_amount: finalShare
        });
      });
    } else if (splitType === 'percentage') {
      let totalPct = 0;
      selectedUserIds.forEach((uid) => {
        const pct = parseFloat(splitValues[uid]) || 0;
        totalPct += pct;
      });

      if (Math.abs(totalPct - 100) > 0.01) {
        setError(`La suma de los porcentajes debe ser exactamente 100%. Actualmente es ${totalPct}%.`);
        return;
      }

      let accumulated = 0;
      selectedUserIds.forEach((uid, index) => {
        const pct = parseFloat(splitValues[uid]) || 0;
        let finalShare = parseFloat(((amount * pct) / 100).toFixed(2));
        
        if (index === selectedUserIds.length - 1) {
          finalShare = parseFloat((amount - accumulated).toFixed(2));
        } else {
          accumulated += finalShare;
        }

        sharesToSave.push({
          user_id: uid,
          share_amount: finalShare
        });
      });
    } else if (splitType === 'shares') {
      let totalShares = 0;
      selectedUserIds.forEach((uid) => {
        const sh = parseInt(splitValues[uid]) || 0;
        totalShares += sh;
      });

      if (totalShares <= 0) {
        setError('El número total de participaciones debe ser mayor a 0.');
        return;
      }

      let accumulated = 0;
      selectedUserIds.forEach((uid, index) => {
        const sh = parseInt(splitValues[uid]) || 0;
        let finalShare = parseFloat(((amount * sh) / totalShares).toFixed(2));

        if (index === selectedUserIds.length - 1) {
          finalShare = parseFloat((amount - accumulated).toFixed(2));
        } else {
          accumulated += finalShare;
        }

        sharesToSave.push({
          user_id: uid,
          share_amount: finalShare
        });
      });
    } else if (splitType === 'custom') {
      let totalCustom = 0;
      selectedUserIds.forEach((uid) => {
        const val = parseFloat(splitValues[uid]) || 0;
        totalCustom += val;
      });

      if (Math.abs(totalCustom - amount) > 0.01) {
        setError(`La suma de los montos personalizados ($${totalCustom}) debe ser exactamente igual al monto total ($${amount}).`);
        return;
      }

      selectedUserIds.forEach((uid) => {
        const val = parseFloat(splitValues[uid]) || 0;
        sharesToSave.push({
          user_id: uid,
          share_amount: val
        });
      });
    }

    // Proceso de guardado en Dexie
    const newExpenseId = generateUUID();
    const newExpense: Expense = {
      id: newExpenseId,
      event_id: eventId,
      user_id: payerId,
      amount,
      description: description.trim(),
      category,
      created_at: new Date().toISOString()
    };

    try {
      // 1. Guardar gasto principal
      await db.expenses.add(newExpense);
      await addToSyncQueue('expense', newExpenseId, 'INSERT', newExpense);

      // 2. Guardar particiones
      for (const sh of sharesToSave) {
        const shareId = generateUUID();
        const newShare: ExpenseShare = {
          id: shareId,
          expense_id: newExpenseId,
          user_id: sh.user_id,
          share_amount: sh.share_amount
        };
        await db.expense_shares.add(newShare);
        await addToSyncQueue('expense_share', shareId, 'INSERT', newShare);

        // 3. Crear notificación para los participantes (excepto el pagador)
        if (sh.user_id !== payerId) {
          const notificationId = generateUUID();
          const payerUser = members.find((m) => m.user.id === payerId)?.user;
          const notification = {
            id: notificationId,
            user_id: sh.user_id,
            message: `${payerUser?.name || 'Un miembro'} registró un gasto de $${amount}: "${description}" (Tu parte: $${sh.share_amount})`,
            read: 0,
            created_at: new Date().toISOString()
          };
          await db.notifications.add(notification);
          await addToSyncQueue('notification', notificationId, 'INSERT', notification);
        }
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError('Error al registrar el gasto: ' + err.message);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Registrar Nuevo Gasto">
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '75vh', overflowY: 'auto', paddingRight: '4px' }}>
        <Input
          label="Descripción del Gasto"
          placeholder="ej. Carnes para asado, Bebidas, Taxi"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
        />
        
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '12px' }}>
          <Input
            label="Monto Total ($)"
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
            <select
              className="input-field"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {categorias.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">¿Quién pagó?</label>
          <select
            className="input-field"
            value={payerId}
            onChange={(e) => setPayerId(e.target.value)}
            required
          >
            {members.map((m) => (
              <option key={m.user.id} value={m.user.id}>
                {m.user.avatar} {m.user.name}
              </option>
            ))}
          </select>
        </div>

        {/* Tipo de División */}
        <div className="form-group">
          <label className="form-label">Método de División</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginTop: '4px' }}>
            {[
              { id: 'equal', label: 'Igualitaria' },
              { id: 'percentage', label: 'Porcentaje (%)' },
              { id: 'shares', label: 'Por Participación' },
              { id: 'custom', label: 'Monto Fijo' }
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                className="btn"
                onClick={() => setSplitType(t.id as SplitType)}
                style={{
                  padding: '8px 10px',
                  fontSize: '12px',
                  background: splitType === t.id ? 'var(--primary-light)' : 'rgba(255, 255, 255, 0.03)',
                  border: splitType === t.id ? '1px solid var(--primary)' : '1px solid var(--border-glass)',
                  color: splitType === t.id ? 'var(--text-primary)' : 'var(--text-secondary)'
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Selección de Participantes */}
        <div className="form-group" style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '12px' }}>
          <label className="form-label">Participantes y Distribución</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
            {members.map((m) => {
              const isSelected = !!participants[m.user.id];
              return (
                <div
                  key={m.user.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    background: isSelected ? 'rgba(255,255,255,0.02)' : 'transparent',
                    border: '1px solid' + (isSelected ? 'rgba(255,255,255,0.05)' : 'transparent')
                  }}
                >
                  <button
                    type="button"
                    onClick={() => toggleParticipant(m.user.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      cursor: 'pointer',
                      color: isSelected ? 'var(--text-primary)' : 'var(--text-muted)'
                    }}
                  >
                    {isSelected ? (
                      <CheckSquare size={18} style={{ color: 'var(--primary)' }} />
                    ) : (
                      <Square size={18} />
                    )}
                    <span style={{ fontSize: '18px' }}>{m.user.avatar}</span>
                    <span style={{ fontWeight: 500, fontSize: '14px' }}>{m.user.name}</span>
                  </button>

                  {isSelected && splitType !== 'equal' && (
                    <div style={{ display: 'flex', alignItems: 'center', width: '90px' }}>
                      <input
                        type="number"
                        step={splitType === 'percentage' ? '1' : splitType === 'custom' ? '0.01' : '1'}
                        min="0"
                        className="input-field"
                        style={{ padding: '6px 8px', fontSize: '12px', textAlign: 'right' }}
                        placeholder={
                          splitType === 'percentage' ? '%' : splitType === 'shares' ? 'part.' : '$'
                        }
                        value={splitValues[m.user.id] || ''}
                        onChange={(e) => handleValueChange(m.user.id, e.target.value)}
                        required
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {error && (
          <p style={{ color: 'var(--danger)', fontSize: '13px', textAlign: 'center', fontWeight: 500 }}>
            {error}
          </p>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '12px', borderTop: '1px solid var(--border-glass)', paddingTop: '12px' }}>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" icon={<DollarSign size={16} />}>
            Guardar Gasto
          </Button>
        </div>
      </form>
    </Modal>
  );
};
