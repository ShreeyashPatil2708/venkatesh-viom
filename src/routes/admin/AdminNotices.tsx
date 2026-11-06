import { useCallback, useEffect, useState } from 'react'
import { Alert, EmptyState, Field, PageHeader, Spinner, formatDate } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { errorMessage, supabase } from '../../lib/supabase'
import type { Notice } from '../../lib/types'

export function AdminNotices() {
  const { session } = useAuth()
  const [notices, setNotices] = useState<Notice[] | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [pinned, setPinned] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmId, setConfirmId] = useState('')

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('notices')
      .select('*')
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
    if (error) setError(errorMessage(error))
    setNotices((data as Notice[]) ?? [])
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await supabase.from('notices').insert({
      title: title.trim(),
      body: body.trim(),
      pinned,
      created_by: session?.user.id,
    })
    setBusy(false)
    if (error) {
      setError(errorMessage(error))
      return
    }
    setTitle('')
    setBody('')
    setPinned(false)
    await load()
  }

  async function togglePin(notice: Notice) {
    const { error } = await supabase
      .from('notices')
      .update({ pinned: !notice.pinned })
      .eq('id', notice.id)
    if (error) setError(errorMessage(error))
    await load()
  }

  async function remove(id: string) {
    const { error } = await supabase.from('notices').delete().eq('id', id)
    if (error) setError(errorMessage(error))
    setConfirmId('')
    await load()
  }

  return (
    <>
      <PageHeader title="Notices" />
      {error && <Alert>{error}</Alert>}

      <form onSubmit={create} className="card mb-6 space-y-4 p-4">
        <h2 className="font-semibold">Post a notice</h2>
        <Field label="Title" required>
          <input
            className="input"
            required
            maxLength={120}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Water supply cut on Sunday"
          />
        </Field>
        <Field label="Details" required>
          <textarea
            className="input min-h-28"
            required
            maxLength={4000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </Field>
        <label className="flex items-center gap-3 rounded-xl bg-canvas p-3 text-sm">
          <input
            type="checkbox"
            className="size-5 accent-brand-600"
            checked={pinned}
            onChange={(e) => setPinned(e.target.checked)}
          />
          Pin to the top
        </label>
        <button
          className="btn-primary w-full"
          disabled={busy || title.trim().length < 3 || body.trim().length < 3}
        >
          {busy ? <Spinner /> : 'Post notice'}
        </button>
      </form>

      {notices === null ? (
        <div className="flex justify-center py-10 text-brand-600">
          <Spinner className="size-7" />
        </div>
      ) : notices.length === 0 ? (
        <EmptyState title="No notices posted yet" />
      ) : (
        <div className="space-y-3">
          {notices.map((notice) => (
            <article key={notice.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-semibold">{notice.title}</h3>
                {notice.pinned && (
                  <span className="shrink-0 rounded-full bg-brand-100 px-2.5 py-1 text-xs font-semibold text-brand-900">
                    Pinned
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted">{formatDate(notice.created_at)}</p>
              <p className="mt-2 text-sm whitespace-pre-wrap">{notice.body}</p>
              <div className="mt-3 flex gap-2">
                <button className="btn-secondary flex-1" onClick={() => togglePin(notice)}>
                  {notice.pinned ? 'Unpin' : 'Pin'}
                </button>
                {confirmId === notice.id ? (
                  <>
                    <button className="btn-danger flex-1" onClick={() => remove(notice.id)}>
                      Confirm delete
                    </button>
                    <button className="btn-secondary" onClick={() => setConfirmId('')}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <button className="btn-danger flex-1" onClick={() => setConfirmId(notice.id)}>
                    Delete
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  )
}
