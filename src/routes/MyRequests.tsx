import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { TicketListItem } from '../components/TicketBits'
import { Alert, EmptyState, PageHeader, Spinner } from '../components/ui'
import { useAuth } from '../lib/auth'
import { errorMessage, supabase } from '../lib/supabase'
import type { Ticket } from '../lib/types'

export function MyRequests() {
  const { session } = useAuth()
  const [tickets, setTickets] = useState<Ticket[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!session) return
    supabase
      .from('tickets')
      .select('*')
      .eq('created_by', session.user.id)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(errorMessage(error))
        setTickets((data as Ticket[]) ?? [])
      })
  }, [session])

  return (
    <>
      <PageHeader
        title="My requests"
        action={
          <Link to="/new" className="btn-primary">
            New
          </Link>
        }
      />
      {error && <Alert>{error}</Alert>}
      {tickets === null ? (
        <div className="flex justify-center py-10 text-brand-600">
          <Spinner className="size-7" />
        </div>
      ) : tickets.length === 0 ? (
        <EmptyState title="Nothing raised yet">
          Use the New button to send a complaint, suggestion or enquiry to the committee.
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {tickets.map((ticket) => (
            <TicketListItem key={ticket.id} ticket={ticket} to={`/t/${ticket.id}`} />
          ))}
        </div>
      )}
    </>
  )
}
