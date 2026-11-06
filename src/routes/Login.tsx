import { useState } from 'react'
import { CenteredCard } from '../components/Layout'
import { Alert, Field, Spinner } from '../components/ui'
import { errorMessage, supabase } from '../lib/supabase'

export function Login() {
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')

  async function sendCode(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setNote('')
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: true },
    })
    setBusy(false)
    if (error) {
      setError(errorMessage(error))
      return
    }
    setStep('code')
    setNote(`We sent a 6-digit code to ${email.trim().toLowerCase()}.`)
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code.trim(),
      type: 'email',
    })
    setBusy(false)
    if (error) setError(errorMessage(error))
    // On success the auth listener swaps this screen out.
  }

  if (step === 'email') {
    return (
      <CenteredCard title="Sign in" subtitle="We'll email you a code — no password to remember.">
        <form onSubmit={sendCode} className="space-y-4">
          {error && <Alert>{error}</Alert>}
          <Field label="Email address" required>
            <input
              className="input"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </Field>
          <button className="btn-primary w-full" disabled={busy || !email.trim()}>
            {busy ? <Spinner /> : 'Send me a code'}
          </button>
        </form>
      </CenteredCard>
    )
  }

  return (
    <CenteredCard title="Enter the code" subtitle={note}>
      <form onSubmit={verify} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field label="6-digit code" hint="Check your spam folder if it hasn't arrived." required>
          <input
            className="input text-center text-2xl tracking-[0.4em]"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            required
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="······"
          />
        </Field>
        <button className="btn-primary w-full" disabled={busy || code.length !== 6}>
          {busy ? <Spinner /> : 'Sign in'}
        </button>
        <div className="flex justify-between text-sm">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              setStep('email')
              setCode('')
              setError('')
            }}
          >
            Use another email
          </button>
          <button type="button" className="btn-ghost" onClick={sendCode} disabled={busy}>
            Resend code
          </button>
        </div>
      </form>
    </CenteredCard>
  )
}
