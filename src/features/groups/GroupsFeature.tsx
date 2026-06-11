import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Group, type GroupMember, type Event } from '../../core/db';
import { useAuthStore } from '../../store/authStore';
import { useUiStore } from '../../store/uiStore';
import { Card, Button, Input, Modal, Badge } from '../../components/UI';
import { addToSyncQueue, generateUUID } from '../../core/sync/syncEngine';
import { FolderKanban, Users, CalendarPlus, ChevronLeft, Plus, Mail } from 'lucide-react';

export const GroupsFeature: React.FC = () => {
  const { currentUser, allUsers } = useAuthStore();
  const { activeView, selectedGroupId, setView } = useUiStore();

  // Modales
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupDesc, setGroupDesc] = useState('');

  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [invitedUserId, setInvitedUserId] = useState('');

  const [isCreateEventOpen, setIsCreateEventOpen] = useState(false);
  const [eventName, setEventName] = useState('');

  // Queries reactivas usando Dexie useLiveQuery
  const groups = useLiveQuery(async () => {
    if (!currentUser) return [];
    
    // Obtener membresías de este usuario
    const memberships = await db.group_members
      .where('user_id')
      .equals(currentUser.id)
      .toArray();
    
    const groupIds = memberships.map((m) => m.group_id);
    
    // Cargar los objetos de los grupos correspondientes
    return db.groups.where('id').anyOf(groupIds).toArray();
  }, [currentUser]);

  const activeGroup = useLiveQuery(async () => {
    if (activeView !== 'group-detail' || !selectedGroupId) return null;
    return db.groups.get(selectedGroupId);
  }, [activeView, selectedGroupId]);

  const groupMembers = useLiveQuery(async () => {
    if (activeView !== 'group-detail' || !selectedGroupId) return [];
    
    const members = await db.group_members
      .where('group_id')
      .equals(selectedGroupId)
      .toArray();

    const result = [];
    for (const member of members) {
      const user = await db.users.get(member.user_id);
      if (user) {
        result.push({
          memberId: member.id,
          user,
          role: member.role
        });
      }
    }
    return result;
  }, [activeView, selectedGroupId]);

  const groupEvents = useLiveQuery(async () => {
    if (activeView !== 'group-detail' || !selectedGroupId) return [];
    return db.events
      .where('group_id')
      .equals(selectedGroupId)
      .toArray();
  }, [activeView, selectedGroupId]);

  // Manejo de creación de Grupo
  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !groupName.trim()) return;

    const newGroupId = generateUUID();
    const newGroup: Group = {
      id: newGroupId,
      name: groupName.trim(),
      description: groupDesc.trim(),
      created_by: currentUser.id
    };

    const newMembership: GroupMember = {
      id: generateUUID(),
      group_id: newGroupId,
      user_id: currentUser.id,
      role: 'admin'
    };

    // Escribir localmente y encolar sync
    await db.groups.add(newGroup);
    await db.group_members.add(newMembership);

    await addToSyncQueue('group', newGroupId, 'INSERT', newGroup);
    await addToSyncQueue('group_member', newMembership.id, 'INSERT', newMembership);

    setGroupName('');
    setGroupDesc('');
    setIsCreateGroupOpen(false);
  };

  // Manejo de Invitación de Miembros (Simulada para testing local interactivo)
  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroupId || !invitedUserId) return;

    // Verificar si ya es miembro
    const existing = await db.group_members
      .where('[group_id+user_id]')
      .equals([selectedGroupId, invitedUserId])
      .first();

    if (existing) {
      alert('Este usuario ya es miembro de este grupo.');
      return;
    }

    const newMemberId = generateUUID();
    const newMembership: GroupMember = {
      id: newMemberId,
      group_id: selectedGroupId,
      user_id: invitedUserId,
      role: 'member'
    };

    await db.group_members.add(newMembership);
    await addToSyncQueue('group_member', newMemberId, 'INSERT', newMembership);

    // Encolar una notificación para el usuario invitado
    const newNotificationId = generateUUID();
    
    const notification = {
      id: newNotificationId,
      user_id: invitedUserId,
      message: `Fuiste agregado al grupo "${activeGroup?.name}"`,
      read: 0,
      created_at: new Date().toISOString()
    };
    await db.notifications.add(notification);
    await addToSyncQueue('notification', newNotificationId, 'INSERT', notification);

    setInvitedUserId('');
    setIsInviteOpen(false);
  };

  // Manejo de creación de Evento
  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroupId || !eventName.trim()) return;

    const newEventId = generateUUID();
    const newEvent: Event = {
      id: newEventId,
      group_id: selectedGroupId,
      name: eventName.trim(),
      status: 'open',
      created_at: new Date().toISOString()
    };

    await db.events.add(newEvent);
    await addToSyncQueue('event', newEventId, 'INSERT', newEvent);

    setEventName('');
    setIsCreateEventOpen(false);
    setView('event-detail', selectedGroupId, newEventId, true);
  };

  // VISTA 1: Lista de Grupos
  if (activeView === 'groups') {
    return (
      <div className="animate-fade-in">
        <div className="app-header">
          <div className="page-title">
            <h1>Mis Grupos Financieros</h1>
          </div>
          <Button onClick={() => setIsCreateGroupOpen(true)} icon={<Plus size={16} />}>
            Crear Grupo
          </Button>
        </div>

        {groups && groups.length === 0 ? (
          <Card glass className="text-center" style={{ padding: '48px' }}>
            <FolderKanban size={48} style={{ color: 'var(--text-secondary)', marginBottom: '16px' }} />
            <h3>Aún no perteneces a ningún grupo</h3>
            <p style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>
              Crea tu primer grupo para empezar a dividir gastos familiares o de eventos.
            </p>
            <Button
              onClick={() => setIsCreateGroupOpen(true)}
              style={{ marginTop: '20px' }}
              icon={<Plus size={16} />}
            >
              Crear Grupo Ahora
            </Button>
          </Card>
        ) : (
          <div className="grid-2">
            {groups?.map((group) => (
              <Card
                key={group.id}
                hoverable
                onClick={() => setView('group-detail', group.id)}
                style={{ padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '160px' }}
              >
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>{group.name}</h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineBreak: 'anywhere' }}>
                    {group.description || 'Sin descripción'}
                  </p>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
                  <span style={{ color: 'var(--primary)', fontSize: '13px', fontWeight: 600 }}>Ver detalles &rarr;</span>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Modal: Crear Grupo */}
        <Modal
          isOpen={isCreateGroupOpen}
          onClose={() => setIsCreateGroupOpen(false)}
          title="Crear Nuevo Grupo Financiero"
        >
          <form onSubmit={handleCreateGroup} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <Input
              label="Nombre del Grupo"
              placeholder="ej. Familia, Viaje a Cartagena, Oficina"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              required
            />
            <Input
              label="Descripción"
              placeholder="ej. Gastos compartidos del hogar o paseo de fin de semana"
              value={groupDesc}
              onChange={(e) => setGroupDesc(e.target.value)}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
              <Button type="button" variant="secondary" onClick={() => setIsCreateGroupOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">Crear Grupo</Button>
            </div>
          </form>
        </Modal>
      </div>
    );
  }

  // VISTA 2: Detalle de Grupo
  if (activeView === 'group-detail') {
    if (!activeGroup) {
      return (
        <div className="animate-fade-in">
          <Button variant="secondary" onClick={() => setView('groups')} icon={<ChevronLeft size={16} />}>
            Volver a Grupos
          </Button>
          <p style={{ marginTop: '16px', color: 'var(--text-secondary)' }}>Cargando grupo...</p>
        </div>
      );
    }

    return (
      <div className="animate-fade-in">
        <div style={{ marginBottom: '24px' }}>
          <Button variant="secondary" onClick={() => setView('groups')} icon={<ChevronLeft size={16} />}>
            Volver a Grupos
          </Button>
        </div>

        <div className="app-header" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: 800 }}>{activeGroup.name}</h1>
            <p style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>{activeGroup.description}</p>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <Button variant="secondary" onClick={() => setIsInviteOpen(true)} icon={<Users size={16} />}>
              Invitar Miembro
            </Button>
            <Button onClick={() => setIsCreateEventOpen(true)} icon={<CalendarPlus size={16} />}>
              Nuevo Evento
            </Button>
          </div>
        </div>

        <div className="grid-2">
          {/* Columna Izquierda: Eventos */}
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>Eventos del Grupo</span>
              <Badge variant="purple">{groupEvents ? groupEvents.length : 0}</Badge>
            </h2>

            {!groupEvents || groupEvents.length === 0 ? (
              <Card glass style={{ padding: '32px', textAlign: 'center' }}>
                <p style={{ color: 'var(--text-secondary)' }}>Aún no hay eventos registrados.</p>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Crea un evento (ej: "Finanzas Mensuales" o "Cena") para empezar a dividir gastos.
                </p>
                <Button
                  onClick={() => setIsCreateEventOpen(true)}
                  style={{ marginTop: '16px' }}
                  icon={<CalendarPlus size={16} />}
                  variant="secondary"
                >
                  Crear Primer Evento
                </Button>
              </Card>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {(groupEvents || []).map((evt) => (
                  <Card
                    key={evt.id}
                    hoverable
                    onClick={() => setView('event-detail', activeGroup.id, evt.id)}
                    style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  >
                    <div>
                      <p style={{ fontWeight: 600, fontSize: '16px' }}>{evt.name}</p>
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        Creado el {new Date(evt.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <Badge variant={evt.status === 'open' ? 'emerald' : 'rose'}>
                        {evt.status === 'open' ? 'Abierto' : 'Liquidado'}
                      </Badge>
                      <span style={{ color: 'var(--primary)', fontWeight: 600 }}>&rarr;</span>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Columna Derecha: Miembros del Grupo */}
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>Miembros del Grupo</span>
              <Badge variant="emerald">{groupMembers ? groupMembers.length : 0}</Badge>
            </h2>

            <Card style={{ padding: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {(groupMembers || []).map((m) => (
                  <div
                    key={m.memberId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 0',
                      borderBottom: '1px solid rgba(255,255,255,0.03)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '24px' }}>{m.user.avatar}</span>
                      <div>
                        <p style={{ fontWeight: 600, fontSize: '14px' }}>
                          {m.user.name} {m.user.id === currentUser?.id ? '(Tú)' : ''}
                        </p>
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{m.user.email}</p>
                      </div>
                    </div>
                    <Badge variant={m.role === 'admin' ? 'purple' : 'amber'}>
                      {m.role === 'admin' ? 'Admin' : 'Miembro'}
                    </Badge>
                  </div>
                ))}
              </div>
              <Button
                variant="secondary"
                onClick={() => setIsInviteOpen(true)}
                style={{ width: '100%', marginTop: '16px' }}
                icon={<Users size={16} />}
              >
                Agregar Miembro
              </Button>
            </Card>
          </div>
        </div>

        {/* Modal: Invitar Miembro */}
        <Modal
          isOpen={isInviteOpen}
          onClose={() => setIsInviteOpen(false)}
          title="Agregar Miembro al Grupo"
        >
          <form onSubmit={handleInviteMember} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="form-group">
              <label className="form-label">Seleccionar Usuario</label>
              <select
                className="input-field"
                value={invitedUserId}
                onChange={(e) => setInvitedUserId(e.target.value)}
                required
              >
                <option value="">-- Selecciona un usuario --</option>
                {allUsers
                  .filter((u) => u.id !== currentUser?.id)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.avatar} {u.name} ({u.email})
                    </option>
                  ))}
              </select>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
              <Button type="button" variant="secondary" onClick={() => setIsInviteOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" icon={<Mail size={16} />}>
                Invitar
              </Button>
            </div>
          </form>
        </Modal>

        {/* Modal: Crear Evento */}
        <Modal
          isOpen={isCreateEventOpen}
          onClose={() => setIsCreateEventOpen(false)}
          title="Crear Evento del Grupo"
        >
          <form onSubmit={handleCreateEvent} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <Input
              label="Nombre del Evento"
              placeholder="ej. Parrillada Sábado, Regalo de Cumpleaños, Salida a Cenar"
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              required
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
              <Button type="button" variant="secondary" onClick={() => setIsCreateEventOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">Crear Evento</Button>
            </div>
          </form>
        </Modal>
      </div>
    );
  }

  return null;
};
