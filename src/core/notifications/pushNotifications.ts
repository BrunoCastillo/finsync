const PUSH_ENABLED_KEY = 'FinSync_PushEnabled';

interface ShowBrowserNotificationParams {
  title: string;
  body: string;
  tag?: string;
  url?: string;
}

export function isPushSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;
}

export function isPushEnabled(): boolean {
  return localStorage.getItem(PUSH_ENABLED_KEY) === 'true';
}

export function setPushEnabled(is_enabled: boolean): void {
  localStorage.setItem(PUSH_ENABLED_KEY, String(is_enabled));
}

export function getPushPermission(): NotificationPermission | 'unsupported' {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission;
}

export async function requestPushPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!isPushSupported()) return 'unsupported';

  const permission = await Notification.requestPermission();
  if (permission === 'granted') {
    setPushEnabled(true);
  }
  return permission;
}

export async function showBrowserNotification(params: ShowBrowserNotificationParams): Promise<void> {
  if (!isPushSupported() || !isPushEnabled()) return;
  if (Notification.permission !== 'granted') return;

  const notificationOptions: NotificationOptions & { vibrate?: number[] } = {
    body: params.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: params.tag ?? 'finsync-alert',
    data: { url: params.url ?? '/' },
    vibrate: [120, 60, 120]
  };

  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(params.title, notificationOptions);
  } catch {
    new Notification(params.title, notificationOptions);
  }
}

export async function sendTestPushNotification(): Promise<void> {
  await showBrowserNotification({
    title: 'FinSync',
    body: 'Las notificaciones push están activas.',
    tag: 'finsync-test',
    url: '/'
  });
}
