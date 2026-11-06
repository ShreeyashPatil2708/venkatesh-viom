import { useEffect, useState } from 'react'
import { CenteredCard } from '../components/Layout'
import { Alert, Field, Spinner } from '../components/ui'
import { useAuth } from '../lib/auth'
import { errorMessage, supabase } from '../lib/supabase'
import type { Flat, ResidentType } from '../lib/types'

/** Shown once, straight after a new email signs in: who are you and which flat? */
export function Register() {
  const { session, refreshProfile, signOut } = useAuth()
  const [flats, setFlats] = useState<Flat[]>([])
  const [flatId, setFlatId] = useState('')
  const [name, setName] = useState('')
  const [mobile, setMobile] = useState('')
  const [residentType, setResidentType] = useState<ResidentType>('owner')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase
      .from('flats')
      .select('id, wing, number, label')
      .order('wing')
      .order('number')
      .then(({ data, error }) => {
        if (error) setError(errorMessage(error))
        else setFlats((data as Flat[]) ?? [])
      })
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const digits = mobile.replace(/\D/g, '')
    if (digits.length !== 10) {
      setError('Please enter a 10-digit mobile number.')
      return
    }
    setBusy(true)
    setError('')
    const { error } = await supabase.from('profiles').insert({
      id: session?.user.id,
      flat_id: flatId,
      name: name.trim(),
      mobile: digits,
      email: session?.user.email ?? '',
      resident_type: residentType,
      role: 'resident',
      status: 'pending',
    })
    setBusy(false)
    if (error) {
      setError(errorMessage(error))
      return
    }
    await refreshProfile()
  }

  return (
    <CenteredCard title="Your details" subtitle="One time only. The committee checks this against the society records.">
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert>{error}</Alert>}

        <Field label="Flat" required>
          <select className="input" required value={flatId} onChange={(e) => setFlatId(e.target.value)}>
            <option value="">Select your flat</option>
            {flats.map((flat) => (
              <option key={flat.id} value={flat.id}>
                {flat.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Full name" required>
          <input
            className="input"
            required
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="As in society records"
          />
        </Field>

        <Field label="Mobile number" hint="Used only by the committee to reach you." required>
          <input
            className="input"
            required
            inputMode="numeric"
            autoComplete="tel"
            maxLength={10}
            value={mobile}
            onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))}
            placeholder="10 digits"
          />
        </Field>

        <Field label="You are" required>
          <div className="grid grid-cols-2 gap-2">
            {(['owner', 'tenant'] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setResidentType(type)}
                className={
                  residentType === type
                    ? 'btn bg-brand-600 text-white capitalize'
                    : 'btn-secondary capitalize'
                }
              >
                {type}
              </button>
            ))}
          </div>
        </Field>

        <button className="btn-primary w-full" disabled={busy || !flatId || !name.trim()}>
          {busy ? <Spinner /> : 'Submit for approval'}
        </button>
        <button type="button" className="btn-ghost w-full" onClick={signOut}>
          Sign out
        </button>
      </form>
    </CenteredCard>
  )
}

/** Approval gate: the account exists but the committee hasn't confirmed the flat yet. */
export function AwaitingApproval() {
  const { profile, refreshProfile, signOut } = useAuth()
  const [busy, setBusy] = useState(false)
  const rejected = profile?.status === 'rejected'

  return (
    <CenteredCard
      title={rejected ? 'Request declined' : 'Waiting for approval'}
      subtitle={
        rejected
          ? 'The committee could not match your details to the society records.'
          : 'A committee member will approve your flat shortly.'
      }
    >
      <div className="space-y-4">
        <Alert kind={rejected ? 'error' : 'info'}>
          {rejected
            ? 'Please speak to the secretary, or sign out and register again with the correct flat and name.'
            : 'You will be able to raise requests as soon as this is approved. You can close the app — nothing is lost.'}
        </Alert>
        {!rejected && (
          <button
            className="btn-secondary w-full"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              await refreshProfile()
              setBusy(false)
            }}
          >
            {busy ? <Spinner /> : 'Check again'}
          </button>
        )}
        <button className="btn-ghost w-full" onClick={signOut}>
          Sign out
        </button>
      </div>
    </CenteredCard>
  )
}
