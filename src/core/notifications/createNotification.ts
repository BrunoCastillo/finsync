import { db, type AppNotification } from '../db';
import { addToSyncQueue, generateUUID } from '../sync/syncEngine';
import { showBrowserNotification } from './pushNotifications';

interface CreateAppNotificationParams {
  user_id: string;
  message: string;
  push_title?: string;
  push_url?: string;
}

function getCurrentUserId(): string | null {
  return localStorage.getItem('FinSync_CurrentUser');
}

// Crea notificación in-app y dispara push del navegador si aplica
export async function createAppNotification(params: CreateAppNotificationParams): Promise<AppNotification> {
  const notification: AppNotification = {
    id: generateUUID(),
    user_id: params.user_id,
    message: params.message,
    read: 0,
    created_at: new Date().toISOString()
  };

  await db.notifications.add(notification);
  await addToSyncQueue('notification', notification.id, 'INSERT', notification);

  if (getCurrentUserId() === params.user_id) {
    await showBrowserNotification({
      title: params.push_title ?? 'FinSync',
      body: params.message,
      tag: notification.id,
      url: params.push_url ?? '/'
    });
  }

  return notification;
}
