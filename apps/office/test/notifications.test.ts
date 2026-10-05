import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestNotificationPermission, sendDesktopNotification } from '../src/shell/notifications.ts';

describe('desktop notifications', () => {
  const originalNotification = (globalThis as any).Notification;

  afterEach(() => {
    (globalThis as any).Notification = originalNotification;
    vi.restoreAllMocks();
  });

  it('handles environment without Notification support', async () => {
    delete (globalThis as any).Notification;
    expect(await requestNotificationPermission()).toBe(false);
    expect(sendDesktopNotification('Test')).toBeNull();
  });

  it('returns true when permission is already granted', async () => {
    (globalThis as any).Notification = class MockNotification {
      static permission = 'granted';
    };

    expect(await requestNotificationPermission()).toBe(true);
  });

  it('returns false when permission is denied', async () => {
    (globalThis as any).Notification = class MockNotification {
      static permission = 'denied';
    };

    expect(await requestNotificationPermission()).toBe(false);
  });

  it('requests permission when default and returns true if user grants', async () => {
    const mockRequest = vi.fn().mockResolvedValue('granted');
    (globalThis as any).Notification = class MockNotification {
      static permission = 'default';
      static requestPermission = mockRequest;
    };

    expect(await requestNotificationPermission()).toBe(true);
    expect(mockRequest).toHaveBeenCalledOnce();
  });

  it('sends desktop notification when permission is granted', () => {
    let createdArgs: any = null;
    class MockNotification {
      static permission = 'granted';
      constructor(title: string, options?: any) {
        createdArgs = { title, options };
      }
    }
    (globalThis as any).Notification = MockNotification;

    const notif = sendDesktopNotification('Tugas Baru', { body: 'Detail tugas' });
    expect(notif).toBeInstanceOf(MockNotification);
    expect(createdArgs.title).toBe('Tugas Baru');
    expect(createdArgs.options.body).toBe('Detail tugas');
    expect(createdArgs.options.icon).toBe('/favicon.ico');
  });

  it('does not send notification when permission is not granted', () => {
    class MockNotification {
      static permission = 'default';
    }
    (globalThis as any).Notification = MockNotification;

    const notif = sendDesktopNotification('Test');
    expect(notif).toBeNull();
  });
});
