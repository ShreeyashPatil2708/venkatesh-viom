import { useEffect, useState } from 'react'
import { useRefresh } from '../lib/refresh'
import { Alert, EmptyState, PageHeader, Spinner, formatDate } from '../components/ui'
import { errorMessage, supabase } from '../lib/supabase'
import type { Notice } from '../lib/types'

export function Notices() {
  const { refreshKey } = useRefresh()
  const [notices, setNotices] = useState<Notice[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase
      .from('notices')
      .select('*')
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(errorMessage(error))
        setNotices((data as Notice[]) ?? [])
      })
  }, [refreshKey])

  return (
    <>
      <PageHeader title="Notices" />
      {error && <Alert>{error}</Alert>}
      {notices === null ? (
        <div className="flex justify-center py-10 text-brand-600">
          <Spinner className="size-7" />
        </div>
      ) : notices.length === 0 ? (
        <EmptyState title="No notices yet">
          Announcements from the committee will appear here.
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {notices.map((notice) => (
            <article key={notice.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-semibold">{notice.title}</h2>
                {notice.pinned && (
                  <span className="shrink-0 rounded-full bg-brand-100 px-2.5 py-1 text-xs font-semibold text-brand-900">
                    Pinned
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted">{formatDate(notice.created_at)}</p>
              <p className="mt-2 whitespace-pre-wrap">{notice.body}</p>
            </article>
          ))}
        </div>
      )}
    </>
  )
}
