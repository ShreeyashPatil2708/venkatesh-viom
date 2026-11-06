import type { ReactNode } from 'react'
import {
  CATEGORY_LABEL,
  STATUS_LABEL,
  type TicketCategory,
  type TicketStatus,
} from '../lib/types'

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block size-5 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
    />
  )
}

export function FullPageSpinner() {
  return (
    <div className="flex min-h-dvh items-center justify-center text-brand-600">
      <Spinner className="size-8" />
    </div>
  )
}

export function Alert({ kind = 'error', children }: { kind?: 'error' | 'info' | 'success'; children: ReactNode }) {
  const tone = {
    error: 'border-red-200 bg-red-50 text-red-800',
    info: 'border-brand-200 bg-brand-50 text-brand-900',
    success: 'border-green-200 bg-green-50 text-green-900',
  }[kind]
  return <div className={`rounded-xl border px-3.5 py-3 text-sm ${tone}`}>{children}</div>
}

export function Field({
  label,
  hint,
  children,
  required,
}: {
  label: string
  hint?: string
  children: ReactNode
  required?: boolean
}) {
  return (
    <label className="block">
      <span className="label">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-muted">{hint}</span>}
    </label>
  )
}

const STATUS_TONE: Record<TicketStatus, string> = {
  new: 'bg-amber-100 text-amber-900',
  in_progress: 'bg-blue-100 text-blue-900',
  resolved: 'bg-green-100 text-green-900',
  closed: 'bg-slate-200 text-slate-700',
}

export function StatusChip({ status }: { status: TicketStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_TONE[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  )
}

export function CategoryChip({ category }: { category: TicketCategory }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-canvas px-2.5 py-1 text-xs font-medium text-muted">
      {CATEGORY_LABEL[category]}
    </span>
  )
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card px-5 py-10 text-center">
      <p className="font-semibold">{title}</p>
      {children && <p className="mx-auto mt-1.5 max-w-xs text-sm text-muted">{children}</p>}
    </div>
  )
}

export function PageHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h1 className="text-xl font-bold tracking-tight">{title}</h1>
      {action}
    </div>
  )
}

/** "6 Nov 2026, 5:40 pm" — short and unambiguous for Indian readers. */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
