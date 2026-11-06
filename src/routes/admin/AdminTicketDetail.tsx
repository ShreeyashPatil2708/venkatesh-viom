import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useRefresh } from '../../lib/refresh'
import { TicketPhoto, Timeline } from '../../components/TicketBits'
import { Alert, CategoryChip, Field, Spinner, StatusChip, formatDateTime } from '../../components/ui'
import { errorMessage, supabase } from '../../lib/supabase'
import {
  STATUS_LABEL,
  type Profile,
  type TicketStatus,
  type TicketUpdate,
  type TicketWithRelations,
} from '../../lib/types'

const STATUSES: TicketStatus[] = ['new', 'in_progress', 'resolved', 'closed']

export function AdminTicketDetail() {
  const { refreshKey } = useRefresh()
  const { id } = useParams<{ id: string }>()
  const [ticket, setTicket] = useState<TicketWithRelations | null>(null)
  const [updates, setUpdates] = useState<TicketUpdate[]>([])
  const [authorNames, setAuthorNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<TicketStatus>('new')
  const [note, setNote] = useState('')
  const [visible, setVisible] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')

  const load = useCallback(async () => {
    if (!id) return
    const [ticketRes, updatesRes] = await Promise.all([
      supabase
        .from('tickets')
        .select('*, flats(label), profiles(name, mobile, resident_type)')
        .eq('id', id)
        .maybeSingle(),
      supabase
        .from('ticket_updates')
        .select('*')
        .eq('ticket_id', id)
        .order('created_at', { ascending: true }),
    ])
    if (ticketRes.error) setError(errorMessage(ticketRes.error))
    const loaded = (ticketRes.data as TicketWithRelations) ?? null
    setTicket(loaded)
    if (loaded) setStatus(loaded.status)
    const loadedUpdates = (updatesRes.data as TicketUpdate[]) ?? []
    setUpdates(loadedUpdates)

    const authorIds = [...new Set(loadedUpdates.map((update) => update.author_id))]
    if (authorIds.length > 0) {
      const { data } = await supabase.from('profiles').select('id, name').in('id', authorIds)
      setAuthorNames(
        Object.fromEntries(
          ((data as Pick<Profile, 'id' | 'name'>[]) ?? []).map((row) => [row.id, row.name]),
        ),
      )
    }
    setLoading(false)
  }, [id])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setSaved('')
    // One RPC so the note is always recorded before the status moves — the
    // notification email reads the latest note to quote it back to the resident.
    const { error } = await supabase.rpc('admin_update_ticket', {
      p_ticket_id: id,
      p_status: status,
      p_note: note.trim() || null,
      p_visible: visible,
    })
    setBusy(false)
    if (error) {
      setError(errorMessage(error))
      return
    }
    const emailed = visible && (status !== ticket?.status || note.trim().length > 0)
    setNote('')
    setSaved(emailed ? 'Saved. The resident has been emailed.' : 'Saved.')
    await load()
  }

  if (loading) {
    return (
      <div className="flex justify-center py-10 text-brand-600">
        <Spinner className="size-7" />
      </div>
    )
  }

  if (!ticket) {
    return (
      <>
        <Alert>{error || 'That request could not be found.'}</Alert>
        <Link to="/admin" className="btn-secondary mt-4 w-full">
          Back to all requests
        </Link>
      </>
    )
  }

  const nothingToSave = status === ticket.status && note.trim().length === 0

  return (
    <div className="space-y-4">
      <Link to="/admin" className="btn-ghost -ml-3">
        ← All requests
      </Link>

      <div className="card space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-lg font-bold">{ticket.subject}</h1>
          <StatusChip status={ticket.status} />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <CategoryChip category={ticket.category} />
          <span className="font-mono">{ticket.ref_code}</span>
          <span>·</span>
          <span>{formatDateTime(ticket.created_at)}</span>
        </div>
        <p className="whitespace-pre-wrap">{ticket.description}</p>
        {ticket.photo_path && <TicketPhoto path={ticket.photo_path} />}
      </div>

      <div className="card p-4">
        <h2 className="mb-2 font-semibold">Raised by</h2>
        <p className="text-sm">
          {ticket.profiles?.name} · {ticket.flats?.label}
          {ticket.profiles?.resident_type && ` · ${ticket.profiles.resident_type}`}
        </p>
        {ticket.profiles?.mobile && (
          <a href={`tel:${ticket.profiles.mobile}`} className="btn-secondary mt-3 w-full">
            Call {ticket.profiles.mobile}
          </a>
        )}
      </div>

      <form onSubmit={submit} className="card space-y-4 p-4">
        <h2 className="font-semibold">Update this request</h2>
        {error && <Alert>{error}</Alert>}
        {saved && <Alert kind="success">{saved}</Alert>}

        <Field label="Status">
          <div className="grid grid-cols-2 gap-2">
            {STATUSES.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setStatus(item)}
                className={status === item ? 'btn bg-brand-600 text-white' : 'btn-secondary'}
              >
                {STATUS_LABEL[item]}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Reply or note" hint="Quoted in the email the resident receives.">
          <textarea
            className="input min-h-28"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Plumber visiting tomorrow morning."
          />
        </Field>

        <label className="flex items-start gap-3 rounded-xl bg-canvas p-3">
          <input
            type="checkbox"
            className="mt-0.5 size-5 accent-brand-600"
            checked={visible}
            onChange={(e) => setVisible(e.target.checked)}
          />
          <span className="text-sm">
            <span className="font-medium">Show this note to the resident</span>
            <span className="block text-muted">
              Untick to keep it as an internal committee note.
            </span>
          </span>
        </label>

        <button className="btn-primary w-full" disabled={busy || nothingToSave}>
          {busy ? <Spinner /> : 'Save update'}
        </button>
      </form>

      <div className="card space-y-3 p-4">
        <h2 className="font-semibold">History</h2>
        <Timeline updates={updates} authorNames={authorNames} />
      </div>
    </div>
  )
}
