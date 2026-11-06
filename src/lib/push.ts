import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { supabase } from './supabase'

/**
 * Registers this phone for push and stores its FCM token against the signed-in
 * user. Silently does nothing in a browser — push only exists in the APK.
 *
 * Returns a cleanup function that removes the listeners.
 */
export async function registerPush(userId: string): Promise<() => void> {
  if (!Capacitor.isNativePlatform()) return () => {}

  const listeners: { remove: () => void }[] = []

  try {
    let permission = await PushNotifications.checkPermissions()
    if (permission.receive === 'prompt' || permission.receive === 'prompt-with-rationale') {
      permission = await PushNotifications.requestPermissions()
    }
    if (permission.receive !== 'granted') return () => {}

    const registration = await PushNotifications.addListener('registration', async (token) => {
      // Upsert: the same phone keeps its token across sign-ins, and a phone
      // handed to someone else must re-point at the new user.
      await supabase
        .from('device_tokens')
        .upsert(
          { token: token.value, user_id: userId, platform: 'android', updated_at: new Date().toISOString() },
          { onConflict: 'token' },
        )
    })
    listeners.push(registration)

    const failure = await PushNotifications.addListener('registrationError', (err) => {
      console.warn('push registration failed', err)
    })
    listeners.push(failure)

    const tapped = await PushNotifications.addListener(
      'pushNotificationActionPerformed',
      (action) => {
        const data = action.notification.data as Record<string, string> | undefined
        if (!data) return
        // Deep-link to the thing the notification is about.
        const path =
          data.kind === 'new_member'
            ? '/admin/members'
            : data.kind === 'new_ticket' && data.ticket_id
              ? `/admin/t/${data.ticket_id}`
              : data.ticket_id
                ? `/t/${data.ticket_id}`
                : '/notifications'
        window.location.assign(path)
      },
    )
    listeners.push(tapped)

    // Android 8+ drops notifications whose channel does not exist, and the
    // FCM payload names 'default'.
    try {
      await PushNotifications.createChannel({
        id: 'default',
        name: 'Society updates',
        description: 'Complaints, replies and approvals',
        importance: 5,
        visibility: 1,
      })
    } catch {
      // Not Android, or channels unsupported; the default channel applies.
    }

    await PushNotifications.register()
  } catch (err) {
    console.warn('push unavailable', err)
  }

  return () => listeners.forEach((listener) => listener.remove())
}

/** Drops this phone's registration, so a signed-out device stops receiving push. */
export async function unregisterPush(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    await PushNotifications.removeAllListeners()
  } catch {
    // Nothing registered; nothing to clean up.
  }
}
