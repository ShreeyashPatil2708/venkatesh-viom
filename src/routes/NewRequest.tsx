import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Field, PageHeader, Spinner } from '../components/ui'
import { useAuth } from '../lib/auth'
import { compressImage } from '../lib/image'
import { errorMessage, supabase } from '../lib/supabase'
import { CATEGORY_LABEL, type TicketCategory } from '../lib/types'

const CATEGORIES: TicketCategory[] = ['complaint', 'suggestion', 'enquiry']

const PLACEHOLDER: Record<TicketCategory, string> = {
  complaint: 'What is wrong, where exactly, and since when?',
  suggestion: 'What would you like the committee to consider?',
  enquiry: 'What would you like to know?',
}

export function NewRequest() {
  const { session, profile } = useAuth()
  const navigate = useNavigate()
  const [category, setCategory] = useState<TicketCategory>('complaint')
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError('')
    try {
      const compressed = await compressImage(file)
      setPhoto(compressed)
      setPreview(URL.createObjectURL(compressed))
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!profile?.flat_id || !session) return
    setBusy(true)
    setError('')

    let photoPath: string | null = null
    if (photo) {
      photoPath = `${session.user.id}/${crypto.randomUUID()}.jpg`
      const { error: uploadError } = await supabase.storage
        .from('ticket-photos')
        .upload(photoPath, photo, { contentType: 'image/jpeg' })
      if (uploadError) {
        setBusy(false)
        setError(errorMessage(uploadError))
        return
      }
    }

    const { data, error: insertError } = await supabase
      .from('tickets')
      .insert({
        flat_id: profile.flat_id,
        created_by: session.user.id,
        category,
        subject: subject.trim(),
        description: description.trim(),
        photo_path: photoPath,
      })
      .select('id')
      .single()

    setBusy(false)
    if (insertError) {
      setError(errorMessage(insertError))
      return
    }
    navigate(`/t/${data.id}`, { replace: true, state: { justCreated: true } })
  }

  return (
    <>
      <PageHeader title="New request" />
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert>{error}</Alert>}

        <Field label="What is this about?" required>
          <div className="grid grid-cols-3 gap-2">
            {CATEGORIES.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setCategory(item)}
                className={
                  category === item ? 'btn bg-brand-600 px-2 text-white' : 'btn-secondary px-2'
                }
              >
                {CATEGORY_LABEL[item]}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Subject" hint="A short title, e.g. 'Water leaking in B-wing lobby'" required>
          <input
            className="input"
            required
            maxLength={120}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </Field>

        <Field label="Details" required>
          <textarea
            className="input min-h-36"
            required
            maxLength={4000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={PLACEHOLDER[category]}
          />
        </Field>

        <Field label="Photo (optional)" hint="Helps the committee see the problem.">
          {preview ? (
            <div className="space-y-2">
              <img src={preview} alt="Selected" className="max-h-56 w-full rounded-xl object-cover" />
              <button
                type="button"
                className="btn-secondary w-full"
                onClick={() => {
                  setPhoto(null)
                  setPreview('')
                }}
              >
                Remove photo
              </button>
            </div>
          ) : (
            <label className="btn-secondary w-full cursor-pointer">
              Choose a photo
              <input type="file" accept="image/*" className="hidden" onChange={pickPhoto} />
            </label>
          )}
        </Field>

        <button
          className="btn-primary w-full"
          disabled={busy || subject.trim().length < 3 || description.trim().length < 5}
        >
          {busy ? <Spinner /> : 'Submit request'}
        </button>
        <p className="text-center text-xs text-muted">
          The committee is emailed as soon as you submit.
        </p>
      </form>
    </>
  )
}
