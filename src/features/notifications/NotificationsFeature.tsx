import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../core/db';
import { useAuthStore } from '../../store/authStore';
import { Card, Button, Badge } from '../../components/UI';
import { addToSyncQueue } from '../../core/sync/syncEngine';
import {
  getPushPermission,
  isPushEnabled,
  isPushSupported,
  requestPushPermission,
  sendTestPushNotification,
  setPushEnabled
} from '../../core/notifications/pushNotifications';
import { Bell, BellOff, CheckCheck, Smartphone } from 'lucide-react';

export const NotificationsFeature: React.FC = () => {
  const { currentUser } = useAuthStore();
  const [pushPermission, setPushPermission] = useState(getPushPermission());

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

  const handleEnablePush = async () => {
    const permission = await requestPushPermission();
    setPushPermission(permission);
    if (permission === 'granted') {
      await sendTestPushNotification();
    }
  };

  const handleDisablePush = () => {
    setPushEnabled(false);
    setPushPermission(getPushPermission());
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

      <Card glass style={{ padding: '16px 20px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '12px' }}>
            <Smartphone size={20} style={{ marginTop: '2px', color: 'var(--primary)', flexShrink: 0 }} />
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: 700 }}>Notificaciones push del navegador</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '6px' }}>
                Recibe alertas cuando registren gastos, te agreguen a un grupo o superes tu presupuesto.
              </p>
              {!isPushSupported() && (
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
                  Tu navegador no soporta notificaciones push.
                </p>
              )}
              {isPushSupported() && pushPermission === 'denied' && (
                <p style={{ fontSize: '12px', color: 'var(--danger)', marginTop: '8px' }}>
                  Permiso denegado. Habilítalo en la configuración del navegador.
                </p>
              )}
            </div>
          </div>
          {isPushSupported() && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              {pushPermission === 'granted' && isPushEnabled() ? (
                <>
                  <Badge variant="emerald">Activas</Badge>
                  <Button variant="secondary" onClick={() => sendTestPushNotification()} style={{ padding: '8px 12px', fontSize: '12px' }}>
                    Probar
                  </Button>
                  <Button variant="secondary" onClick={handleDisablePush} style={{ padding: '8px 12px', fontSize: '12px' }}>
                    Desactivar
                  </Button>
                </>
              ) : pushPermission !== 'denied' ? (
                <Button onClick={handleEnablePush} style={{ padding: '8px 14px', fontSize: '12px' }}>
                  Activar push
                </Button>
              ) : null}
            </div>
          )}
        </div>
      </Card>

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
