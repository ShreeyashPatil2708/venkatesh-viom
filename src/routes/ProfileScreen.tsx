import { useEffect, useState } from 'react'
import { Alert, Field, PageHeader, Spinner, formatDate } from '../components/ui'
import { isReviewDueSoon, reviewDaysLeft } from '../lib/review'
import { useAuth } from '../lib/auth'
import { errorMessage, supabase } from '../lib/supabase'
import { ROLE_LABEL } from '../lib/types'

export function ProfileScreen() {
  const { profile, refreshProfile, signOut } = useAuth()
  const [flatLabel, setFlatLabel] = useState('')
  const [name, setName] = useState(profile?.name ?? '')
  const [mobile, setMobile] = useState(profile?.mobile ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!profile?.flat_id) return
    supabase
      .from('flats')
      .select('label')
      .eq('id', profile.flat_id)
      .maybeSingle()
      .then(({ data }) => setFlatLabel((data as { label: string } | null)?.label ?? ''))
  }, [profile?.flat_id])

  const dirty = name.trim() !== profile?.name || mobile !== profile?.mobile

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (mobile.replace(/\D/g, '').length !== 10) {
      setError('Please enter a 10-digit mobile number.')
      return
    }
    setBusy(true)
    setError('')
    setSaved(false)
    const { error } = await supabase
      .from('profiles')
      .update({ name: name.trim(), mobile: mobile.replace(/\D/g, '') })
      .eq('id', profile?.id ?? '')
    setBusy(false)
    if (error) {
      setError(errorMessage(error))
      return
    }
    setSaved(true)
    await refreshProfile()
  }

  return (
    <>
      <PageHeader title="Profile" />
      <div className="space-y-4">
        {profile && isReviewDueSoon(profile) && (
          <Alert kind="info">
            Tenant access is confirmed by the committee once a year. Yours is due in{' '}
            {reviewDaysLeft(profile)} days — the committee can already see it on their list.
          </Alert>
        )}
        <dl className="card divide-y divide-line">
          {[
            ['Flat', flatLabel || '—'],
            ['You are', profile ? (profile.resident_type === 'owner' ? 'Owner' : 'Tenant') : '—'],
            ['Email', profile?.email ?? '—'],
            ['Role', profile ? ROLE_LABEL[profile.role] : '—'],
            ...(profile?.review_due_at
              ? [['Confirmed until', formatDate(profile.review_due_at)] as [string, string]]
              : []),
          ].map(([key, value]) => (
            <div key={key} className="flex items-center justify-between gap-3 px-4 py-3">
              <dt className="text-sm text-muted">{key}</dt>
              <dd className="truncate text-sm font-medium">{value}</dd>
            </div>
          ))}
        </dl>

        <form onSubmit={save} className="card space-y-4 p-4">
          <h2 className="font-semibold">Edit your details</h2>
          {error && <Alert>{error}</Alert>}
          {saved && <Alert kind="success">Saved.</Alert>}
          <Field label="Full name">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Mobile number">
            <input
              className="input"
              inputMode="numeric"
              maxLength={10}
              value={mobile}
              onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))}
            />
          </Field>
          <button className="btn-primary w-full" disabled={busy || !dirty || !name.trim()}>
            {busy ? <Spinner /> : 'Save changes'}
          </button>
          <p className="text-xs text-muted">
            To change your flat, ask the secretary — flats are set by the committee.
          </p>
        </form>

        <button className="btn-danger w-full" onClick={signOut}>
          Sign out
        </button>
      </div>
    </>
  )
}
