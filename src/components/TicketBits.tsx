import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { STATUS_LABEL, type Ticket, type TicketUpdate } from '../lib/types'
import { CategoryChip, StatusChip, formatDateTime } from './ui'

/** Photos live in a private bucket, so every view needs a short-lived signed URL. */
export function TicketPhoto({ path }: { path: string }) {
  const [url, setUrl] = useState('')

  useEffect(() => {
    let active = true
    supabase.storage
      .from('ticket-photos')
      .createSignedUrl(path, 60 * 60)
      .then(({ data }) => {
        if (active && data) setUrl(data.signedUrl)
      })
    return () => {
      active = false
    }
  }, [path])

  if (!url) return <div className="h-48 animate-pulse rounded-xl bg-canvas" />
  return (
    <a href={url} target="_blank" rel="noreferrer">
      <img src={url} alt="Attached photo" className="max-h-80 w-full rounded-xl object-cover" />
    </a>
  )
}

export function TicketListItem({
  ticket,
  to,
  subtitle,
}: {
  ticket: Ticket
  to: string
  subtitle?: string
}) {
  return (
    <Link to={to} className="card block p-4 transition hover:border-brand-200 hover:bg-brand-50/40">
      <div className="flex items-start justify-between gap-3">
        <p className="font-semibold">{ticket.subject}</p>
        <StatusChip status={ticket.status} />
      </div>
      <p className="mt-1 line-clamp-2 text-sm text-muted">{ticket.description}</p>
      <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs text-muted">
        <CategoryChip category={ticket.category} />
        <span className="font-mono">{ticket.ref_code}</span>
        <span>·</span>
        <span>{formatDateTime(ticket.created_at)}</span>
        {subtitle && (
          <>
            <span>·</span>
            <span className="font-medium text-ink">{subtitle}</span>
          </>
        )}
      </div>
    </Link>
  )
}

/** Status changes and committee replies, oldest first. */
export function Timeline({
  updates,
  authorNames,
}: {
  updates: TicketUpdate[]
  authorNames?: Record<string, string>
}) {
  if (updates.length === 0) {
    return (
      <p className="text-sm text-muted">
        No updates yet. The committee will reply here.
      </p>
    )
  }

  return (
    <ol className="space-y-3">
      {updates.map((update) => (
        <li key={update.id} className="border-l-2 border-brand-200 pl-3.5">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span>{formatDateTime(update.created_at)}</span>
            {authorNames?.[update.author_id] && (
              <>
                <span>·</span>
                <span className="font-medium text-ink">{authorNames[update.author_id]}</span>
              </>
            )}
            {!update.visible_to_resident && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-900">
                Internal
              </span>
            )}
          </div>
          {update.new_status && (
            <p className="mt-1 text-sm font-semibold">
              Status changed to {STATUS_LABEL[update.new_status]}
            </p>
          )}
          {update.note && <p className="mt-1 text-sm whitespace-pre-wrap">{update.note}</p>}
        </li>
      ))}
    </ol>
  )
}
