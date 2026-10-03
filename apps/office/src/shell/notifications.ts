/**
 * Browser Desktop Notification Service for Agentic OS Office
 */

function getNotificationClass(): typeof Notification | null {
  if (typeof globalThis !== 'undefined' && 'Notification' in globalThis) {
    return (globalThis as unknown as { Notification: typeof Notification }).Notification;
  }
  return null;
}

export async function requestNotificationPermission(): Promise<boolean> {
  const NotificationClass = getNotificationClass();
  if (!NotificationClass) {
    return false;
  }
  if (NotificationClass.permission === 'granted') {
    return true;
  }
  if (NotificationClass.permission === 'denied') {
    return false;
  }
  try {
    const permission = await NotificationClass.requestPermission();
    return permission === 'granted';
  } catch {
    return false;
  }
}

export function sendDesktopNotification(
  title: string,
  options?: NotificationOptions
): Notification | null {
  const NotificationClass = getNotificationClass();
  if (!NotificationClass || NotificationClass.permission !== 'granted') {
    return null;
  }

  try {
    return new NotificationClass(title, {
      icon: '/favicon.ico',
      ...options,
    });
  } catch (err) {
    console.warn('Failed to dispatch desktop notification:', err);
    return null;
  }
}
