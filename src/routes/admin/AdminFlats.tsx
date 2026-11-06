import { useCallback, useEffect, useState } from 'react'
import { useRefresh } from '../../lib/refresh'
import { Alert, EmptyState, Field, PageHeader, Spinner } from '../../components/ui'
import { errorMessage, supabase } from '../../lib/supabase'
import type { Flat } from '../../lib/types'

/** Accepts "A-101", "A 101", "B/202" or bare "101", one per line or comma separated. */
function parseFlatList(text: string): { wing: string; number: string }[] {
  const seen = new Set<string>()
  const out: { wing: string; number: string }[] = []
  for (const token of text.split(/[\n,]/)) {
    const entry = token.trim()
    if (!entry) continue
    const match = entry.match(/^(?:([A-Za-z0-9]+)\s*[-/\s]\s*)?([A-Za-z0-9]+)$/)
    if (!match) continue
    const wing = (match[1] ?? '').toUpperCase()
    const number = match[2].toUpperCase()
    const key = `${wing}|${number}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ wing, number })
  }
  return out
}

export function AdminFlats() {
  const { refreshKey } = useRefresh()
  const [flats, setFlats] = useState<Flat[] | null>(null)
  const [bulk, setBulk] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [confirmId, setConfirmId] = useState('')

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('flats')
      .select('id, wing, number, label')
      .order('wing')
      .order('number')
    if (error) setError(errorMessage(error))
    setFlats((data as Flat[]) ?? [])
  }, [])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  const parsed = parseFlatList(bulk)

  async function addFlats(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setNote('')
    const existing = new Set((flats ?? []).map((flat) => `${flat.wing}|${flat.number}`))
    const fresh = parsed.filter((flat) => !existing.has(`${flat.wing}|${flat.number}`))
    if (fresh.length === 0) {
      setBusy(false)
      setNote('Those flats are already in the list.')
      return
    }
    const { error } = await supabase.from('flats').insert(fresh)
    setBusy(false)
    if (error) {
      setError(errorMessage(error))
      return
    }
    setBulk('')
    setNote(`Added ${fresh.length} flat${fresh.length === 1 ? '' : 's'}.`)
    await load()
  }

  async function remove(id: string) {
    setError('')
    const { error } = await supabase.from('flats').delete().eq('id', id)
    if (error) {
      setError(
        error.message.includes('violates foreign key')
          ? 'That flat has residents or requests attached, so it cannot be deleted.'
          : errorMessage(error),
      )
    }
    setConfirmId('')
    await load()
  }

  return (
    <>
      <PageHeader title="Flats" />
      {error && <Alert>{error}</Alert>}

      <form onSubmit={addFlats} className="card my-4 space-y-4 p-4">
        <h2 className="font-semibold">Add flats</h2>
        {note && <Alert kind="info">{note}</Alert>}
        <Field
          label="Flat numbers"
          hint="One per line or comma separated. A-101, B-202, or just 101 if there are no wings."
        >
          <textarea
            className="input min-h-28 font-mono"
            value={bulk}
            onChange={(e) => setBulk(e.target.value)}
            placeholder={'A-101\nA-102\nB-201'}
          />
        </Field>
        <button className="btn-primary w-full" disabled={busy || parsed.length === 0}>
          {busy ? <Spinner /> : `Add ${parsed.length || ''} flat${parsed.length === 1 ? '' : 's'}`}
        </button>
      </form>

      {flats === null ? (
        <div className="flex justify-center py-10 text-brand-600">
          <Spinner className="size-7" />
        </div>
      ) : flats.length === 0 ? (
        <EmptyState title="No flats added yet">
          Residents pick their flat from this list when they sign up, so add them first.
        </EmptyState>
      ) : (
        <>
          <h2 className="mb-2 text-sm font-semibold text-muted uppercase">
            {flats.length} flats
          </h2>
          <ul className="card divide-y divide-line">
            {flats.map((flat) => (
              <li key={flat.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="font-medium">{flat.label}</span>
                {confirmId === flat.id ? (
                  <span className="flex gap-2">
                    <button className="btn-danger px-3" onClick={() => remove(flat.id)}>
                      Delete
                    </button>
                    <button className="btn-secondary px-3" onClick={() => setConfirmId('')}>
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button className="btn-ghost text-sm" onClick={() => setConfirmId(flat.id)}>
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}
