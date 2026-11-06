import { createClient } from 'jsr:@supabase/supabase-js@2'

export const env = {
  supabaseUrl: Deno.env.get('SUPABASE_URL')!,
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  brevoKey: Deno.env.get('BREVO_API_KEY') ?? '',
  fromEmail: Deno.env.get('MAIL_FROM_EMAIL') ?? '',
  fromName: Deno.env.get('MAIL_FROM_NAME') ?? 'Society App',
  webhookSecret: Deno.env.get('WEBHOOK_SECRET') ?? '',
  appUrl: (Deno.env.get('APP_URL') ?? '').replace(/\/$/, ''),
  societyName: Deno.env.get('SOCIETY_NAME') ?? 'Our Society',
}

export function admin() {
  return createClient(env.supabaseUrl, env.serviceKey, {
    auth: { persistSession: false },
  })
}

/** The Postgres trigger is the only legitimate caller, and it knows this secret. */
export function checkSecret(req: Request): Response | null {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }
  if (!env.webhookSecret || req.headers.get('x-webhook-secret') !== env.webhookSecret) {
    return new Response('Forbidden', { status: 403 })
  }
  return null
}

const STATUS_WORDS: Record<string, string> = {
  new: 'New',
  in_progress: 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
}

export const statusWord = (status: string) => STATUS_WORDS[status] ?? status

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

type Block = { label: string; value: string }

/** One plain, readable template for every email we send. */
export function renderEmail(options: {
  heading: string
  intro: string
  blocks: Block[]
  body?: string
  quote?: { title: string; text: string }
  action?: { label: string; url: string }
  footer?: string
}): string {
  const rows = options.blocks
    .map(
      (block) => `
      <tr>
        <td style="padding:4px 12px 4px 0;color:#64756f;font-size:13px;white-space:nowrap">${escapeHtml(block.label)}</td>
        <td style="padding:4px 0;color:#16201d;font-size:13px;font-weight:600">${escapeHtml(block.value)}</td>
      </tr>`,
    )
    .join('')

  return `<!doctype html>
<html><body style="margin:0;background:#f6f8f7;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px">
    <p style="margin:0 0 16px;font-size:13px;font-weight:700;color:#157060;letter-spacing:.02em">
      ${escapeHtml(env.societyName).toUpperCase()}
    </p>
    <div style="background:#fff;border:1px solid #e2e8e6;border-radius:16px;padding:20px">
      <h1 style="margin:0 0 8px;font-size:19px;color:#16201d">${escapeHtml(options.heading)}</h1>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:#64756f">${escapeHtml(options.intro)}</p>
      <table style="border-collapse:collapse;margin-bottom:16px">${rows}</table>
      ${
        options.body
          ? `<div style="font-size:14px;line-height:1.6;color:#16201d;white-space:pre-wrap;border-top:1px solid #e2e8e6;padding-top:14px">${escapeHtml(options.body)}</div>`
          : ''
      }
      ${
        options.quote
          ? `<div style="margin-top:16px;background:#eff7f4;border-radius:12px;padding:12px 14px">
               <p style="margin:0 0 4px;font-size:12px;font-weight:700;color:#0f5a4d">${escapeHtml(options.quote.title)}</p>
               <p style="margin:0;font-size:14px;line-height:1.6;color:#16201d;white-space:pre-wrap">${escapeHtml(options.quote.text)}</p>
             </div>`
          : ''
      }
      ${
        options.action
          ? `<p style="margin:20px 0 0"><a href="${options.action.url}" style="display:inline-block;background:#157060;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 18px;border-radius:10px">${escapeHtml(options.action.label)}</a></p>`
          : ''
      }
    </div>
    <p style="margin:16px 0 0;font-size:12px;line-height:1.5;color:#8b9a95;text-align:center">
      ${escapeHtml(options.footer ?? 'Sent automatically by the society app. Please do not reply to this email.')}
    </p>
  </div>
</body></html>`
}

export function toPlainText(options: {
  heading: string
  intro: string
  blocks: Block[]
  body?: string
  quote?: { title: string; text: string }
  action?: { label: string; url: string }
}): string {
  const lines = [options.heading, '', options.intro, '']
  for (const block of options.blocks) lines.push(`${block.label}: ${block.value}`)
  if (options.body) lines.push('', options.body)
  if (options.quote) lines.push('', `${options.quote.title}:`, options.quote.text)
  if (options.action) lines.push('', `${options.action.label}: ${options.action.url}`)
  return lines.join('\n')
}

/**
 * Claims an email in email_log before sending, so a retried webhook or a
 * double trigger can never send the same message twice.
 */
export async function claim(
  db: ReturnType<typeof admin>,
  row: { ticket_id: string; kind: string; to_email: string; dedupe_key: string },
): Promise<string | null> {
  const { data, error } = await db.from('email_log').insert(row).select('id').maybeSingle()
  if (error) {
    // 23505 = unique violation: this exact email was already claimed.
    if (error.code === '23505') return null
    console.error('email_log claim failed', error)
    return null
  }
  return data?.id ?? null
}

export async function sendViaBrevo(options: {
  db: ReturnType<typeof admin>
  logId: string
  to: { email: string; name?: string }
  subject: string
  html: string
  text: string
}): Promise<void> {
  const { db, logId, to, subject, html, text } = options
  if (!env.brevoKey || !env.fromEmail) {
    await db
      .from('email_log')
      .update({ status: 'failed', error: 'BREVO_API_KEY or MAIL_FROM_EMAIL not set' })
      .eq('id', logId)
    return
  }

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': env.brevoKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { name: env.fromName, email: env.fromEmail },
        to: [{ email: to.email, ...(to.name ? { name: to.name } : {}) }],
        subject,
        htmlContent: html,
        textContent: text,
      }),
    })

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 400)
      await db
        .from('email_log')
        .update({ status: 'failed', error: `${response.status} ${detail}` })
        .eq('id', logId)
      return
    }
    await db.from('email_log').update({ status: 'sent' }).eq('id', logId)
  } catch (err) {
    await db
      .from('email_log')
      .update({ status: 'failed', error: String(err).slice(0, 400) })
      .eq('id', logId)
  }
}
