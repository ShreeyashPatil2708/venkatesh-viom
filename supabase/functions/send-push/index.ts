// Delivers an in-app notification to the user's phones through Firebase Cloud
// Messaging, so it arrives while the app is closed.
// Called by the notifications_push trigger in 0005_push.sql.
//
// FCM's legacy server-key API was retired, so this uses HTTP v1: mint a JWT
// from the service account, exchange it for an access token, then send.
import { admin, checkSecret, env } from '../_shared/mail.ts'

const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging'

type ServiceAccount = { client_email: string; private_key: string; project_id: string }

function serviceAccount(): ServiceAccount | null {
  const raw = Deno.env.get('FCM_SERVICE_ACCOUNT')
  if (!raw) return null
  try {
    return JSON.parse(raw) as ServiceAccount
  } catch {
    console.error('FCM_SERVICE_ACCOUNT is not valid JSON')
    return null
  }
}

function base64url(input: string | Uint8Array): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/** PEM (PKCS#8) to the ArrayBuffer Web Crypto wants. */
function pemToBuffer(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '')
  const binary = atob(body)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

let cachedToken: { value: string; expiresAt: number } | null = null

async function accessToken(account: ServiceAccount): Promise<string | null> {
  // Tokens last an hour; a warm function should not re-mint one per push.
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value

  const now = Math.floor(Date.now() / 1000)
  const claim = {
    iss: account.client_email,
    scope: SCOPE,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }
  const unsigned = `${base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${base64url(
    JSON.stringify(claim),
  )}`

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToBuffer(account.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = new Uint8Array(
    await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned)),
  )
  const assertion = `${unsigned}.${base64url(signature)}`

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })
  if (!response.ok) {
    console.error('token exchange failed', response.status, (await response.text()).slice(0, 300))
    return null
  }
  const data = await response.json()
  cachedToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 }
  return cachedToken.value
}

Deno.serve(async (req) => {
  const rejected = checkSecret(req)
  if (rejected) return rejected

  const { notification_id } = await req.json().catch(() => ({}))
  if (!notification_id) return new Response('notification_id required', { status: 400 })

  const account = serviceAccount()
  if (!account) {
    // Not configured yet: the bell and the emails still work.
    return new Response(JSON.stringify({ sent: 0, reason: 'FCM not configured' }), {
      headers: { 'content-type': 'application/json' },
    })
  }

  const db = admin()
  const { data: note } = await db
    .from('notifications')
    .select('user_id, ticket_id, kind, title, body')
    .eq('id', notification_id)
    .maybeSingle()
  if (!note) return new Response('notification not found', { status: 404 })

  const { data: devices } = await db
    .from('device_tokens')
    .select('token')
    .eq('user_id', note.user_id)
  if (!devices?.length) {
    return new Response(JSON.stringify({ sent: 0, reason: 'no devices' }), {
      headers: { 'content-type': 'application/json' },
    })
  }

  const token = await accessToken(account)
  if (!token) return new Response('could not authenticate with FCM', { status: 502 })

  let sent = 0
  for (const device of devices) {
    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token: device.token,
            notification: { title: note.title, body: note.body ?? '' },
            // Tapping the notification should land on the right screen.
            data: {
              kind: note.kind,
              ticket_id: note.ticket_id ?? '',
              notification_id,
            },
            android: {
              priority: 'HIGH',
              notification: { channel_id: 'default', sound: 'default' },
            },
          },
        }),
      },
    )

    if (response.ok) {
      sent += 1
      continue
    }

    const detail = await response.text()
    // A phone that uninstalled the app leaves a dead token behind; drop it
    // rather than retrying it forever.
    if (response.status === 404 || detail.includes('UNREGISTERED') || detail.includes('INVALID_ARGUMENT')) {
      await db.from('device_tokens').delete().eq('token', device.token)
      console.warn('dropped stale device token')
    } else {
      console.error('fcm send failed', response.status, detail.slice(0, 300))
    }
  }

  return new Response(JSON.stringify({ sent }), {
    headers: { 'content-type': 'application/json' },
  })
})
