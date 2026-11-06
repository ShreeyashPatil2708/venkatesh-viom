import { useCallback, useEffect, useState } from 'react'
import { useRefresh } from '../../lib/refresh'
import { Alert, EmptyState, PageHeader, Spinner, formatDate } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { errorMessage, supabase } from '../../lib/supabase'
import { isReviewDueSoon, isReviewExpired, reviewDaysLeft } from '../../lib/review'
import {
  ROLE_LABEL,
  type Profile,
  type ProfileStatus,
  type ResidentType,
  type UserRole,
} from '../../lib/types'

type Row = Profile & { flats: { label: string } | null }

export function AdminMembers() {
  const { refreshKey } = useRefresh()
  const { profile } = useAuth()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*, flats(label)')
      .order('status')
      .order('created_at', { ascending: false })
    if (error) setError(errorMessage(error))
    setRows((data as Row[]) ?? [])
  }, [])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  async function renew(id: string) {
    setBusyId(id)
    setError('')
    const { error } = await supabase.rpc('renew_resident', { p_id: id })
    if (error) setError(errorMessage(error))
    await load()
    setBusyId('')
  }

  async function patch(
    id: string,
    changes: { status?: ProfileStatus; role?: UserRole; resident_type?: ResidentType },
  ) {
    setBusyId(id)
    setError('')
    const { error } = await supabase.from('profiles').update(changes).eq('id', id)
    if (error) setError(errorMessage(error))
    await load()
    setBusyId('')
  }

  const pending = (rows ?? []).filter((row) => row.status === 'pending')
  // Tenants are confirmed yearly, so surface the ones that have lapsed or are
  // about to before they quietly lose access.
  const dueReview = (rows ?? []).filter(
    (row) => row.status === 'approved' && (isReviewExpired(row) || isReviewDueSoon(row)),
  )
  const others = (rows ?? []).filter((row) => row.status !== 'pending')

  function reviewNote(row: Row): string | null {
    const days = reviewDaysLeft(row)
    if (days === null) return null
    if (days <= 0) return `Tenancy confirmation lapsed ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`
    return `Tenancy to confirm in ${days} day${days === 1 ? '' : 's'}`
  }

  if (rows === null) {
    return (
      <div className="flex justify-center py-10 text-brand-600">
        <Spinner className="size-7" />
      </div>
    )
  }

  return (
    <>
      <PageHeader title="Members" />
      {error && <Alert>{error}</Alert>}

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-muted uppercase">
          Waiting for approval ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <EmptyState title="Nothing to approve" />
        ) : (
          <div className="space-y-3">
            {pending.map((row) => (
              <div key={row.id} className="card p-4">
                <p className="font-semibold">{row.name}</p>
                <p className="text-sm text-muted">
                  {row.flats?.label ?? 'No flat'} · {row.resident_type} · {row.mobile}
                </p>
                <p className="truncate text-xs text-muted">{row.email}</p>
                <p className="mt-0.5 text-xs text-muted">Applied {formatDate(row.created_at)}</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    className="btn-primary"
                    disabled={busyId === row.id}
                    onClick={() => patch(row.id, { status: 'approved' })}
                  >
                    {busyId === row.id ? <Spinner /> : 'Approve'}
                  </button>
                  <button
                    className="btn-danger"
                    disabled={busyId === row.id}
                    onClick={() => patch(row.id, { status: 'rejected' })}
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {dueReview.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-muted uppercase">
            Tenants to confirm ({dueReview.length})
          </h2>
          <div className="space-y-3">
            {dueReview.map((row) => (
              <div
                key={row.id}
                className={`card p-4 ${isReviewExpired(row) ? 'border-amber-300 bg-amber-50/60' : ''}`}
              >
                <p className="font-semibold">{row.name}</p>
                <p className="text-sm text-muted">
                  {row.flats?.label ?? 'No flat'} · {row.mobile}
                </p>
                <p className="mt-1 text-sm font-medium text-amber-900">{reviewNote(row)}</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    className="btn-primary"
                    disabled={busyId === row.id}
                    onClick={() => renew(row.id)}
                  >
                    {busyId === row.id ? <Spinner /> : 'Still lives here'}
                  </button>
                  <button
                    className="btn-danger"
                    disabled={busyId === row.id}
                    onClick={() => patch(row.id, { status: 'rejected' })}
                  >
                    Moved out
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted uppercase">
          Everyone else ({others.length})
        </h2>
        <div className="space-y-3">
          {others.map((row) => (
            <div key={row.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{row.name}</p>
                  <p className="truncate text-sm text-muted">
                    {row.flats?.label ?? 'No flat'} · {row.mobile}
                  </p>
                  <p className="truncate text-xs text-muted">{row.email}</p>
                </div>
                {row.status === 'rejected' && (
                  <span className="shrink-0 rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-800">
                    Declined
                  </span>
                )}
              </div>

              {reviewNote(row) && (
                <p className="mt-1 text-xs text-muted">{reviewNote(row)}</p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <select
                  className="input w-auto"
                  value={row.resident_type}
                  disabled={busyId === row.id}
                  onChange={(e) =>
                    patch(row.id, { resident_type: e.target.value as ResidentType })
                  }
                >
                  <option value="owner">Owner</option>
                  <option value="tenant">Tenant</option>
                </select>
                <select
                  className="input w-auto"
                  value={row.role}
                  disabled={busyId === row.id || row.id === profile?.id}
                  onChange={(e) => patch(row.id, { role: e.target.value as UserRole })}
                >
                  {(Object.keys(ROLE_LABEL) as UserRole[]).map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABEL[role]}
                    </option>
                  ))}
                </select>
                {row.status === 'rejected' ? (
                  <button
                    className="btn-secondary"
                    disabled={busyId === row.id}
                    onClick={() => patch(row.id, { status: 'approved' })}
                  >
                    Approve
                  </button>
                ) : (
                  row.id !== profile?.id && (
                    <button
                      className="btn-danger"
                      disabled={busyId === row.id}
                      onClick={() => patch(row.id, { status: 'rejected' })}
                    >
                      Remove access
                    </button>
                  )
                )}
              </div>
              {row.id === profile?.id && (
                <p className="mt-2 text-xs text-muted">This is you.</p>
              )}
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
