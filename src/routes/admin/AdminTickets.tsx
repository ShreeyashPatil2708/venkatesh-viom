import { useEffect, useMemo, useState } from 'react'
import { TicketListItem } from '../../components/TicketBits'
import { Alert, EmptyState, PageHeader, Spinner } from '../../components/ui'
import { errorMessage, supabase } from '../../lib/supabase'
import {
  CATEGORY_LABEL,
  STATUS_LABEL,
  type TicketCategory,
  type TicketStatus,
  type TicketWithRelations,
} from '../../lib/types'

const STATUS_FILTERS: (TicketStatus | 'all' | 'open')[] = [
  'open',
  'new',
  'in_progress',
  'resolved',
  'closed',
  'all',
]

const FILTER_LABEL: Record<string, string> = {
  ...STATUS_LABEL,
  open: 'Open',
  all: 'All',
}

export function AdminTickets() {
  const [tickets, setTickets] = useState<TicketWithRelations[] | null>(null)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>('open')
  const [categoryFilter, setCategoryFilter] = useState<TicketCategory | 'all'>('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    // A society generates a few hundred of these a year, so one fetch and
    // client-side filtering keeps the filters instant and the counts free.
    supabase
      .from('tickets')
      .select('*, flats(label), profiles(name, mobile, resident_type)')
      .order('created_at', { ascending: false })
      .limit(1000)
      .then(({ data, error }) => {
        if (error) setError(errorMessage(error))
        setTickets((data as TicketWithRelations[]) ?? [])
      })
  }, [])

  const counts = useMemo(() => {
    const base: Record<string, number> = { all: tickets?.length ?? 0, open: 0 }
    for (const ticket of tickets ?? []) {
      base[ticket.status] = (base[ticket.status] ?? 0) + 1
      if (ticket.status === 'new' || ticket.status === 'in_progress') base.open += 1
    }
    return base
  }, [tickets])

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase()
    return (tickets ?? []).filter((ticket) => {
      if (statusFilter === 'open' && !['new', 'in_progress'].includes(ticket.status)) return false
      if (statusFilter !== 'open' && statusFilter !== 'all' && ticket.status !== statusFilter)
        return false
      if (categoryFilter !== 'all' && ticket.category !== categoryFilter) return false
      if (!query) return true
      return [ticket.subject, ticket.ref_code, ticket.flats?.label, ticket.profiles?.name]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(query))
    })
  }, [tickets, statusFilter, categoryFilter, search])

  return (
    <>
      <PageHeader title="All requests" />
      {error && <Alert>{error}</Alert>}

      <div className="mb-4 space-y-2.5">
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter}
              onClick={() => setStatusFilter(filter)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition ${
                statusFilter === filter
                  ? 'bg-ink text-white'
                  : 'bg-white text-muted ring-1 ring-line'
              }`}
            >
              {FILTER_LABEL[filter]}
              <span className="ml-1.5 opacity-70">{counts[filter] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            className="input"
            placeholder="Search subject, ref, flat or name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="input w-auto shrink-0"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as TicketCategory | 'all')}
          >
            <option value="all">All types</option>
            {(Object.keys(CATEGORY_LABEL) as TicketCategory[]).map((category) => (
              <option key={category} value={category}>
                {CATEGORY_LABEL[category]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {tickets === null ? (
        <div className="flex justify-center py-10 text-brand-600">
          <Spinner className="size-7" />
        </div>
      ) : visible.length === 0 ? (
        <EmptyState title="Nothing here">
          {tickets.length === 0
            ? 'No requests have been raised yet.'
            : 'No requests match this filter.'}
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {visible.map((ticket) => (
            <TicketListItem
              key={ticket.id}
              ticket={ticket}
              to={`/admin/t/${ticket.id}`}
              subtitle={[ticket.flats?.label, ticket.profiles?.name].filter(Boolean).join(' · ')}
            />
          ))}
        </div>
      )}
    </>
  )
}
