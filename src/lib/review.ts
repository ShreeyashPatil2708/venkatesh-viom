import type { Profile } from './types'

const DAY_MS = 24 * 60 * 60 * 1000

/** Warn the tenant and flag it to the committee this far ahead. */
export const REVIEW_WARNING_DAYS = 30

/** Days until a tenant's approval lapses. Null for owners, who never expire. */
export function reviewDaysLeft(profile: Pick<Profile, 'review_due_at'>): number | null {
  if (!profile.review_due_at) return null
  return Math.ceil((new Date(profile.review_due_at).getTime() - Date.now()) / DAY_MS)
}

export function isReviewExpired(profile: Pick<Profile, 'review_due_at'>): boolean {
  const days = reviewDaysLeft(profile)
  return days !== null && days <= 0
}

export function isReviewDueSoon(profile: Pick<Profile, 'review_due_at'>): boolean {
  const days = reviewDaysLeft(profile)
  return days !== null && days > 0 && days <= REVIEW_WARNING_DAYS
}
