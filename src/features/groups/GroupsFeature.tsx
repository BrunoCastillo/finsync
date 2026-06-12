import React, { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Group, type GroupMember, type Event } from '../../core/db';
import { useAuthStore } from '../../store/authStore';
import { useUiStore } from '../../store/uiStore';
import { Card, Button, Input, Modal, Badge } from '../../components/UI';
import { addToSyncQueue, generateUUID } from '../../core/sync/syncEngine';
import { createAppNotification } from '../../core/notifications/createNotification';
import { joinGroupByInviteCode } from '../../core/groups/joinGroup';
import { deleteEventCascade, deleteGroupCascade, leaveGroupMembership } from '../../core/groups/groupCascade';
import { buildInviteLink, generateInviteCode } from '../../core/inviteCode';
import { FolderKanban, Users, CalendarPlus, ChevronLeft, Plus, Mail, Link2, Copy, UserPlus, Trash2, LogOut } from 'lucide-react';

export const GroupsFeature: React.FC = () => {
  const { currentUser, allUsers } = useAuthStore();
  const { activeView, selectedGroupId, setView, pendingJoinCode, setPendingJoinCode } = useUiStore();

  // Modales
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [isJoinGroupOpen, setIsJoinGroupOpen] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [joinSuccess, setJoinSuccess] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState('');
  const [groupName, setGroupName] = useState('');
  const [groupDesc, setGroupDesc] = useState('');

  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [invitedUserId, setInvitedUserId] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [groupError, setGroupError] = useState('');

  const [isCreateEventOpen, setIsCreateEventOpen] = useState(false);
  const [eventName, setEventName] = useState('');

  useEffect(() => {
    if (pendingJoinCode) {
      setJoinCode(pendingJoinCode);
      setIsJoinGroupOpen(true);
      setPendingJoinCode(null);
    }
  }, [pendingJoinCode, setPendingJoinCode]);

  const handleCopyInvite = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopyFeedback(label);
      setTimeout(() => setCopyFeedback(''), 2000);
    } catch {
      setCopyFeedback('No se pudo copiar');
      setTimeout(() => setCopyFeedback(''), 2000);
    }
  };

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

  const currentMembership = groupMembers?.find((member) => member.user.id === currentUser?.id);
  const isGroupAdmin = currentMembership?.role === 'admin';

  const handleDeleteGroup = async () => {
    if (!selectedGroupId || !activeGroup || !isGroupAdmin) return;
    const confirmed = window.confirm(
      `¿Eliminar el grupo "${activeGroup.name}" y todos sus eventos/gastos? Esta acción no se puede deshacer.`
    );
    if (!confirmed) return;
    await deleteGroupCascade(selectedGroupId);
    setView('groups');
  };

  const handleLeaveGroup = async () => {
    if (!currentMembership || isGroupAdmin) return;
    const confirmed = window.confirm(`¿Salir del grupo "${activeGroup?.name}"?`);
    if (!confirmed) return;
    await leaveGroupMembership(currentMembership.memberId);
    setView('groups');
  };

  const handleDeleteEvent = async (event: Event) => {
    if (!isGroupAdmin) return;
    const confirmed = window.confirm(
      `¿Eliminar el evento "${event.name}" y todos sus gastos? Esta acción no se puede deshacer.`
    );
    if (!confirmed) return;
    await deleteEventCascade(event.id);
  };

  // Manejo de creación de Grupo
  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    setGroupError('');
    if (!currentUser || !groupName.trim()) return;

    if (groupName.trim().length < 2) {
      setGroupError('El nombre del grupo debe tener al menos 2 caracteres.');
      return;
    }

    const newGroupId = generateUUID();
    const newGroup: Group = {
      id: newGroupId,
      name: groupName.trim(),
      description: groupDesc.trim(),
      created_by: currentUser.id,
      invite_code: generateInviteCode()
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
    setInviteError('');
    if (!selectedGroupId || !invitedUserId) return;

    const existing = await db.group_members
      .where('[group_id+user_id]')
      .equals([selectedGroupId, invitedUserId])
      .first();

    if (existing) {
      setInviteError('Este usuario ya es miembro de este grupo.');
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

    await createAppNotification({
      user_id: invitedUserId,
      message: `Fuiste agregado al grupo "${activeGroup?.name}"`
    });

    setInvitedUserId('');
    setInviteError('');
    setIsInviteOpen(false);
  };

  const availableInviteUsers = allUsers.filter(
    (user) =>
      user.id !== currentUser?.id &&
      !(groupMembers ?? []).some((member) => member.user.id === user.id)
  );

  const handleJoinGroup = async (event: React.FormEvent) => {
    event.preventDefault();
    setJoinError('');
    setJoinSuccess('');
    if (!currentUser || !joinCode.trim()) return;

    setIsJoining(true);
    try {
      const result = await joinGroupByInviteCode({
        inviteCode: joinCode,
        userId: currentUser.id,
        userName: currentUser.name
      });
      setJoinSuccess(
        result.alreadyMember
          ? `Ya perteneces al grupo "${result.group.name}".`
          : `Te uniste al grupo "${result.group.name}".`
      );
      setJoinCode('');
      setTimeout(() => {
        setIsJoinGroupOpen(false);
        setJoinSuccess('');
        setView('group-detail', result.group.id);
      }, 900);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setJoinError(message || 'No se pudo unir al grupo.');
    } finally {
      setIsJoining(false);
    }
  };

  const renderJoinGroupModal = () => (
    <Modal
      isOpen={isJoinGroupOpen}
      onClose={() => {
        setIsJoinGroupOpen(false);
        setJoinError('');
        setJoinSuccess('');
      }}
      title="Unirse a un Grupo"
    >
      <form onSubmit={handleJoinGroup} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'center' }}>
          Pide el código de invitación al administrador del grupo o abre el enlace compartido.
        </p>
        <Input
          label="Código de invitación"
          placeholder="ej. PLAYA26FS"
          value={joinCode}
          onChange={(event) => {
            setJoinCode(event.target.value.toUpperCase());
            setJoinError('');
          }}
          required
        />
        {joinError && (
          <p style={{ color: 'var(--danger)', fontSize: '13px', textAlign: 'center', fontWeight: 500 }}>{joinError}</p>
        )}
        {joinSuccess && (
          <p style={{ color: 'var(--secondary)', fontSize: '13px', textAlign: 'center', fontWeight: 500 }}>{joinSuccess}</p>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setIsJoinGroupOpen(false);
              setJoinError('');
            }}
          >
            Cancelar
          </Button>
          <Button type="submit" icon={<UserPlus size={16} />} disabled={isJoining}>
            {isJoining ? 'Uniéndose...' : 'Unirme'}
          </Button>
        </div>
      </form>
    </Modal>
  );

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
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <Button variant="secondary" onClick={() => setIsJoinGroupOpen(true)} icon={<Link2 size={16} />}>
              Unirse con código
            </Button>
            <Button onClick={() => setIsCreateGroupOpen(true)} icon={<Plus size={16} />}>
              Crear Grupo
            </Button>
          </div>
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
            <Button
              variant="secondary"
              onClick={() => setIsJoinGroupOpen(true)}
              style={{ marginTop: '12px' }}
              icon={<Link2 size={16} />}
            >
              Unirse con código
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
            {groupError && (
              <p style={{ color: 'var(--danger)', fontSize: '13px', textAlign: 'center', fontWeight: 500 }}>
                {groupError}
              </p>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
              <Button type="button" variant="secondary" onClick={() => setIsCreateGroupOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">Crear Grupo</Button>
            </div>
          </form>
        </Modal>

        {renderJoinGroupModal()}
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
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <Button variant="secondary" onClick={() => setIsInviteOpen(true)} icon={<Users size={16} />}>
              Invitar Miembro
            </Button>
            <Button onClick={() => setIsCreateEventOpen(true)} icon={<CalendarPlus size={16} />}>
              Nuevo Evento
            </Button>
            {!isGroupAdmin && currentMembership && (
              <Button variant="secondary" onClick={handleLeaveGroup} icon={<LogOut size={16} />}>
                Salir del grupo
              </Button>
            )}
            {isGroupAdmin && (
              <Button variant="danger" onClick={handleDeleteGroup} icon={<Trash2 size={16} />}>
                Eliminar grupo
              </Button>
            )}
          </div>
        </div>

        {activeGroup.invite_code && (
          <Card glass style={{ padding: '20px', marginBottom: '24px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '16px', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '6px' }}>Invitar con código</h2>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Comparte este código o enlace para que otros se unan al grupo.
                </p>
                <p style={{ fontSize: '24px', fontWeight: 800, letterSpacing: '2px', marginTop: '10px', color: 'var(--primary)' }}>
                  {activeGroup.invite_code}
                </p>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px', wordBreak: 'break-all' }}>
                  {buildInviteLink(activeGroup.invite_code)}
                </p>
                {copyFeedback && (
                  <p style={{ fontSize: '12px', color: 'var(--secondary)', marginTop: '8px' }}>{copyFeedback}</p>
                )}
              </div>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <Button
                  variant="secondary"
                  icon={<Copy size={16} />}
                  onClick={() => handleCopyInvite(activeGroup.invite_code!, 'Código copiado')}
                >
                  Copiar código
                </Button>
                <Button
                  variant="secondary"
                  icon={<Link2 size={16} />}
                  onClick={() => handleCopyInvite(buildInviteLink(activeGroup.invite_code!), 'Enlace copiado')}
                >
                  Copiar enlace
                </Button>
              </div>
            </div>
          </Card>
        )}

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
                      {isGroupAdmin && (
                        <Button
                          variant="danger"
                          onClick={(clickEvent) => {
                            clickEvent.stopPropagation();
                            handleDeleteEvent(evt);
                          }}
                          icon={<Trash2 size={14} />}
                          style={{ padding: '6px 10px', fontSize: '12px' }}
                        >
                          Eliminar
                        </Button>
                      )}
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
          onClose={() => {
            setIsInviteOpen(false);
            setInviteError('');
          }}
          title="Agregar Miembro al Grupo"
        >
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
            En producción usa el código de invitación. En demo puedes agregar usuarios locales directamente.
          </p>
          <form onSubmit={handleInviteMember} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="form-group">
              <label className="form-label">Seleccionar Usuario</label>
              <select
                className="input-field"
                value={invitedUserId}
                onChange={(e) => {
                  setInvitedUserId(e.target.value);
                  setInviteError('');
                }}
                required
              >
                <option value="">-- Selecciona un usuario --</option>
                {availableInviteUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.avatar} {u.name} ({u.email})
                  </option>
                ))}
              </select>
              {availableInviteUsers.length === 0 && (
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
                  No hay más usuarios disponibles para invitar a este grupo.
                </p>
              )}
            </div>
            {inviteError && (
              <p style={{ color: 'var(--danger)', fontSize: '13px', textAlign: 'center', fontWeight: 500 }}>
                {inviteError}
              </p>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setIsInviteOpen(false);
                  setInviteError('');
                }}
              >
                Cancelar
              </Button>
              <Button type="submit" icon={<Mail size={16} />} disabled={availableInviteUsers.length === 0}>
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

        {renderJoinGroupModal()}
      </div>
    );
  }

  return null;
};
