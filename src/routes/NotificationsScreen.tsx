import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRefresh } from '../lib/refresh'
import { Alert, EmptyState, PageHeader, Spinner, formatDateTime } from '../components/ui'
import { useAuth } from '../lib/auth'
import { useNotifications } from '../lib/notifications'
import { errorMessage, supabase } from '../lib/supabase'
import type { AppNotification } from '../lib/types'

export function NotificationsScreen() {
  const { refreshKey } = useRefresh()
  const { isCommittee } = useAuth()
  const { refresh } = useNotifications()
  const navigate = useNavigate()
  const [items, setItems] = useState<AppNotification[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) setError(errorMessage(error))
    setItems((data as AppNotification[]) ?? [])
  }, [])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  async function open(item: AppNotification) {
    if (!item.read_at) {
      await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', item.id)
      await refresh()
    }
    if (item.kind === 'new_member') {
      navigate('/admin/members')
      return
    }
    if (!item.ticket_id) return
    // A new-request alert belongs in the committee view; everything else is
    // about the reader's own request.
    navigate(
      item.kind === 'new_ticket' && isCommittee
        ? `/admin/t/${item.ticket_id}`
        : `/t/${item.ticket_id}`,
    )
  }

  async function markAllRead() {
    setBusy(true)
    await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .is('read_at', null)
    await Promise.all([load(), refresh()])
    setBusy(false)
  }

  const unreadCount = (items ?? []).filter((item) => !item.read_at).length

  return (
    <>
      <PageHeader
        title="Notifications"
        action={
          unreadCount > 0 ? (
            <button className="btn-secondary" disabled={busy} onClick={markAllRead}>
              {busy ? <Spinner /> : 'Mark all read'}
            </button>
          ) : undefined
        }
      />
      {error && <Alert>{error}</Alert>}

      {items === null ? (
        <div className="flex justify-center py-10 text-brand-600">
          <Spinner className="size-7" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState title="Nothing yet">
          You'll be told here when the committee replies to a request.
        </EmptyState>
      ) : (
        <div className="space-y-2.5">
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => open(item)}
              className={`card w-full p-4 text-left transition hover:border-brand-200 ${
                item.read_at ? '' : 'border-brand-200 bg-brand-50/50'
              }`}
            >
              <div className="flex items-start gap-2.5">
                {!item.read_at && (
                  <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-600" />
                )}
                <div className="min-w-0 flex-1">
                  <p className={item.read_at ? 'font-medium' : 'font-semibold'}>{item.title}</p>
                  {item.body && (
                    <p className="mt-1 line-clamp-3 text-sm text-muted">{item.body}</p>
                  )}
                  <p className="mt-1.5 text-xs text-muted">{formatDateTime(item.created_at)}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </>
  )
}
