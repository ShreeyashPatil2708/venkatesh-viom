import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { TicketPhoto, Timeline } from '../components/TicketBits'
import { Alert, CategoryChip, Spinner, StatusChip, formatDateTime } from '../components/ui'
import { errorMessage, supabase } from '../lib/supabase'
import type { Ticket, TicketUpdate } from '../lib/types'

export function TicketDetail() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const justCreated = (location.state as { justCreated?: boolean } | null)?.justCreated
  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [updates, setUpdates] = useState<TicketUpdate[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    let active = true
    Promise.all([
      supabase.from('tickets').select('*').eq('id', id).maybeSingle(),
      supabase
        .from('ticket_updates')
        .select('*')
        .eq('ticket_id', id)
        .order('created_at', { ascending: true }),
    ]).then(([ticketRes, updatesRes]) => {
      if (!active) return
      if (ticketRes.error) setError(errorMessage(ticketRes.error))
      setTicket((ticketRes.data as Ticket) ?? null)
      setUpdates((updatesRes.data as TicketUpdate[]) ?? [])
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [id])

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
        <Link to="/" className="btn-secondary mt-4 w-full">
          Back to my requests
        </Link>
      </>
    )
  }

  return (
    <div className="space-y-4">
      <Link to="/" className="btn-ghost -ml-3">
        ← My requests
      </Link>

      {justCreated && (
        <Alert kind="success">
          Submitted. The committee has been emailed. Your reference is{' '}
          <span className="font-mono font-semibold">{ticket.ref_code}</span>.
        </Alert>
      )}

      <div className="card space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-lg font-bold">{ticket.subject}</h1>
          <StatusChip status={ticket.status} />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <CategoryChip category={ticket.category} />
          <span className="font-mono">{ticket.ref_code}</span>
          <span>·</span>
          <span>Raised {formatDateTime(ticket.created_at)}</span>
        </div>
        <p className="whitespace-pre-wrap">{ticket.description}</p>
        {ticket.photo_path && <TicketPhoto path={ticket.photo_path} />}
      </div>

      <div className="card space-y-3 p-4">
        <h2 className="font-semibold">Updates</h2>
        <Timeline updates={updates} />
      </div>
    </div>
  )
}
