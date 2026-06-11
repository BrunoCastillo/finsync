import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../core/db';
import { useAuthStore } from '../../store/authStore';
import { Card, Button } from '../../components/UI';
import { addToSyncQueue } from '../../core/sync/syncEngine';
import { Bell, BellOff, CheckCheck } from 'lucide-react';

export const NotificationsFeature: React.FC = () => {
  const { currentUser } = useAuthStore();

  const notifications = useLiveQuery(async () => {
    if (!currentUser) return [];
    return db.notifications
      .where('user_id')
      .equals(currentUser.id)
      .reverse()
      .sortBy('created_at');
  }, [currentUser]);

  const handleMarkAsRead = async (notifId: string) => {
    await db.notifications.update(notifId, { read: 1 });
    await addToSyncQueue('notification', notifId, 'UPDATE', { read: 1 });
  };

  const handleMarkAllAsRead = async () => {
    if (!notifications) return;
    const unread = notifications.filter((n) => n.read === 0);
    for (const n of unread) {
      await db.notifications.update(n.id, { read: 1 });
      await addToSyncQueue('notification', n.id, 'UPDATE', { read: 1 });
    }
  };

  if (!currentUser) {
    return (
      <div style={{ textAlign: 'center', padding: '48px' }}>
        <p>Por favor, inicia sesión para ver tus notificaciones.</p>
      </div>
    );
  }

  const unreadCount = notifications ? notifications.filter((n) => n.read === 0).length : 0;

  return (
    <div className="animate-fade-in" style={{ maxWidth: '700px', margin: '0 auto' }}>
      <div className="app-header">
        <div className="page-title">
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span>Notificaciones</span>
            {unreadCount > 0 && (
              <span
                style={{
                  fontSize: '14px',
                  backgroundColor: 'var(--danger)',
                  color: 'white',
                  borderRadius: '50%',
                  width: '24px',
                  height: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700
                }}
              >
                {unreadCount}
              </span>
            )}
          </h1>
        </div>
        {unreadCount > 0 && (
          <Button variant="secondary" onClick={handleMarkAllAsRead} icon={<CheckCheck size={16} />}>
            Marcar todo como leído
          </Button>
        )}
      </div>

      {notifications && notifications.length === 0 ? (
        <Card glass className="text-center" style={{ padding: '48px' }}>
          <BellOff size={48} style={{ color: 'var(--text-secondary)', marginBottom: '16px' }} />
          <h3>No tienes notificaciones</h3>
          <p style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>
            Te avisaremos cuando seas agregado a un grupo, registren nuevos gastos o salden deudas contigo.
          </p>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {notifications?.map((notif) => (
            <Card
              key={notif.id}
              style={{
                padding: '16px 20px',
                borderLeft: notif.read === 0 ? '4px solid var(--primary)' : '1px solid var(--border-glass)',
                backgroundColor: notif.read === 0 ? 'rgba(124, 58, 237, 0.03)' : 'var(--bg-surface)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <Bell
                    size={20}
                    style={{
                      marginTop: '2px',
                      color: notif.read === 0 ? 'var(--primary)' : 'var(--text-muted)',
                      flexShrink: 0
                    }}
                  />
                  <div>
                    <p style={{ fontWeight: notif.read === 0 ? 600 : 400, color: 'var(--text-primary)', fontSize: '14px' }}>
                      {notif.message}
                    </p>
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                      {new Date(notif.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
                {notif.read === 0 && (
                  <Button
                    variant="secondary"
                    onClick={() => handleMarkAsRead(notif.id)}
                    style={{ padding: '6px 10px', fontSize: '11px' }}
                  >
                    Leído
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
