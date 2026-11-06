import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/** False until the Supabase keys are present; the app shows a setup screen. */
export const isConfigured = Boolean(url && anonKey)

export const supabase = createClient(url ?? 'http://localhost', anonKey ?? 'anon', {
  auth: { persistSession: true, autoRefreshToken: true },
})

/** Turns a Supabase/Postgres error into something a resident can read. */
export function errorMessage(error: unknown): string {
  if (!error) return ''
  const raw =
    typeof error === 'string'
      ? error
      : ((error as { message?: string }).message ?? 'Something went wrong')
  if (raw.includes('row-level security')) return 'You are not allowed to do that.'
  if (raw.includes('Invalid login') || raw.includes('Token has expired') || raw.includes('invalid'))
    return 'That code is wrong or has expired. Please ask for a new one.'
  if (raw.includes('rate limit') || raw.includes('Too many'))
    return 'Too many attempts. Please wait a minute and try again.'
  if (raw.includes('duplicate key')) return 'That already exists.'
  if (raw.includes('Failed to fetch')) return 'No internet connection.'
  return raw
}
