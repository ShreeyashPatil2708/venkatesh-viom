// Fires on every new ticket: emails the whole committee.
// Called by the tickets_notify_new trigger in 0001_init.sql.
import {
  admin,
  checkSecret,
  env,
  renderEmail,
  claim,
  sendViaBrevo,
  toPlainText,
} from '../_shared/mail.ts'

const CATEGORY_WORD: Record<string, string> = {
  complaint: 'Complaint',
  suggestion: 'Suggestion',
  enquiry: 'Enquiry',
}

Deno.serve(async (req) => {
  const rejected = checkSecret(req)
  if (rejected) return rejected

  const { ticket_id } = await req.json().catch(() => ({}))
  if (!ticket_id) return new Response('ticket_id required', { status: 400 })

  const db = admin()

  const { data: ticket, error } = await db
    .from('tickets')
    .select('*, flats(label), profiles(name, mobile, resident_type)')
    .eq('id', ticket_id)
    .maybeSingle()

  if (error || !ticket) {
    console.error('ticket lookup failed', error)
    return new Response('ticket not found', { status: 404 })
  }

  const { data: committee } = await db
    .from('profiles')
    .select('name, email')
    .eq('status', 'approved')
    .in('role', ['committee', 'admin'])

  // Standing addresses that are copied on every request whoever is on the
  // committee: the society mailbox keeps a permanent record, and it means a
  // complaint is never lost mid-handover when nobody holds the role yet.
  const { data: archive } = await db
    .from('app_config')
    .select('value')
    .eq('key', 'archive_emails')
    .maybeSingle()

  const recipients = new Map<string, string | undefined>()
  for (const person of committee ?? []) {
    if (person.email) recipients.set(person.email.trim().toLowerCase(), person.name)
  }
  for (const address of (archive?.value ?? '').split(',')) {
    const email = address.trim().toLowerCase()
    if (email && !recipients.has(email)) recipients.set(email, undefined)
  }

  if (recipients.size === 0) {
    console.warn('nobody to notify: no committee members and no archive_emails')
    return new Response(JSON.stringify({ sent: 0 }), { status: 200 })
  }

  let photoNote = ''
  if (ticket.photo_path) {
    const { data: signed } = await db.storage
      .from('ticket-photos')
      .createSignedUrl(ticket.photo_path, 60 * 60 * 24 * 7)
    photoNote = signed?.signedUrl ?? ''
  }

  const category = CATEGORY_WORD[ticket.category] ?? ticket.category
  const content = {
    heading: ticket.subject,
    intro: `A new ${category.toLowerCase()} was raised in the app.`,
    blocks: [
      { label: 'Reference', value: ticket.ref_code },
      { label: 'Type', value: category },
      { label: 'Flat', value: ticket.flats?.label ?? '—' },
      {
        label: 'Raised by',
        value: [ticket.profiles?.name, ticket.profiles?.resident_type, ticket.profiles?.mobile]
          .filter(Boolean)
          .join(' · '),
      },
    ],
    body: ticket.description,
    ...(photoNote
      ? { quote: { title: 'Photo attached', text: photoNote } }
      : {}),
    action: env.appUrl
      ? { label: 'Open in the app', url: `${env.appUrl}/admin/t/${ticket.id}` }
      : undefined,
  }

  const html = renderEmail(content)
  const text = toPlainText(content)
  const subject = `[${ticket.ref_code}] ${category}: ${ticket.subject}`

  let sent = 0
  for (const [email, name] of recipients) {
    const logId = await claim(db, {
      ticket_id: ticket.id,
      kind: 'new_ticket',
      to_email: email,
      dedupe_key: `new_ticket:${ticket.id}:${email}`,
    })
    if (!logId) continue
    await sendViaBrevo({ db, logId, to: { email, name }, subject, html, text })
    sent += 1
  }

  return new Response(JSON.stringify({ sent }), {
    headers: { 'content-type': 'application/json' },
  })
})
