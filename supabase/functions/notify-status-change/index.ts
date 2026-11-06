// Fires when the committee moves a ticket's status: emails the resident who
// raised it, quoting the committee's note.
// Called by the tickets_notify_status trigger in 0001_init.sql.
import {
  admin,
  checkSecret,
  env,
  renderEmail,
  claim,
  sendViaBrevo,
  statusWord,
  toPlainText,
} from '../_shared/mail.ts'

const INTRO: Record<string, string> = {
  new: 'Your request has been reopened.',
  in_progress: 'The committee has started work on your request.',
  resolved: 'The committee has marked your request as resolved.',
  closed: 'Your request has been closed.',
}

Deno.serve(async (req) => {
  const rejected = checkSecret(req)
  if (rejected) return rejected

  const { ticket_id, new_status, note_only, update_id } = await req.json().catch(() => ({}))
  if (!ticket_id || !new_status) {
    return new Response('ticket_id and new_status required', { status: 400 })
  }

  const db = admin()

  const { data: ticket, error } = await db
    .from('tickets')
    .select('*, flats(label), profiles(name, email)')
    .eq('id', ticket_id)
    .maybeSingle()

  if (error || !ticket) {
    console.error('ticket lookup failed', error)
    return new Response('ticket not found', { status: 404 })
  }

  const resident = ticket.profiles as { name: string; email: string } | null
  if (!resident?.email) {
    console.warn('ticket has no resident email', ticket_id)
    return new Response(JSON.stringify({ sent: 0 }), { status: 200 })
  }

  // The committee's note is written in the same transaction as the status
  // move (see admin_update_ticket), so the newest visible note is the one
  // that belongs with this change.
  const { data: latestNote } = await db
    .from('ticket_updates')
    .select('note')
    .eq('ticket_id', ticket_id)
    .eq('visible_to_resident', true)
    .not('note', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const content = {
    heading: ticket.subject,
    intro: note_only
      ? 'The committee has replied to your request.'
      : (INTRO[new_status] ?? `Your request is now ${statusWord(new_status).toLowerCase()}.`),
    blocks: [
      { label: 'Reference', value: ticket.ref_code },
      { label: 'Flat', value: ticket.flats?.label ?? '—' },
      { label: 'Status', value: statusWord(new_status) },
    ],
    ...(latestNote?.note
      ? { quote: { title: 'From the committee', text: latestNote.note } }
      : {}),
    action: env.appUrl
      ? { label: 'View in the app', url: `${env.appUrl}/t/${ticket.id}` }
      : undefined,
    footer:
      !note_only && new_status === 'resolved'
        ? 'If this is not actually fixed, open the app and raise it again — the committee will see it.'
        : undefined,
  }

  const logId = await claim(db, {
    ticket_id: ticket.id,
    kind: note_only ? 'committee_note' : `status_${new_status}`,
    to_email: resident.email,
    // A note is identified by its own row; a status move by the stamp the
    // ticket got when it changed.
    dedupe_key: note_only
      ? `note:${update_id}`
      : `status:${ticket.id}:${new_status}:${ticket.updated_at}`,
  })
  if (!logId) return new Response(JSON.stringify({ sent: 0, reason: 'already sent' }))

  await sendViaBrevo({
    db,
    logId,
    to: { email: resident.email, name: resident.name },
    subject: note_only
      ? `[${ticket.ref_code}] Committee reply: ${ticket.subject}`
      : `[${ticket.ref_code}] ${statusWord(new_status)}: ${ticket.subject}`,
    html: renderEmail(content),
    text: toPlainText(content),
  })

  return new Response(JSON.stringify({ sent: 1 }), {
    headers: { 'content-type': 'application/json' },
  })
})
