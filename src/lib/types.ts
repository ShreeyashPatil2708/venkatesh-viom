export type ResidentType = 'owner' | 'tenant'
export type UserRole = 'resident' | 'committee' | 'admin'
export type ProfileStatus = 'pending' | 'approved' | 'rejected'
export type TicketCategory = 'complaint' | 'suggestion' | 'enquiry'
export type TicketStatus = 'new' | 'in_progress' | 'resolved' | 'closed'

export type Flat = {
  id: string
  wing: string
  number: string
  label: string
}

export type Profile = {
  id: string
  flat_id: string | null
  name: string
  mobile: string
  email: string
  resident_type: ResidentType
  role: UserRole
  status: ProfileStatus
  approved_at: string | null
  /** When an admin must re-confirm a tenant. Null for owners, who never expire. */
  review_due_at: string | null
  created_at: string
}

export type Ticket = {
  id: string
  ref_code: string
  flat_id: string
  created_by: string
  category: TicketCategory
  subject: string
  description: string
  photo_path: string | null
  status: TicketStatus
  created_at: string
  updated_at: string
  resolved_at: string | null
}

export type TicketUpdate = {
  id: string
  ticket_id: string
  author_id: string
  note: string | null
  old_status: TicketStatus | null
  new_status: TicketStatus | null
  visible_to_resident: boolean
  created_at: string
}

export type Notice = {
  id: string
  title: string
  body: string
  pinned: boolean
  created_by: string
  created_at: string
}

export type NotificationKind = 'new_ticket' | 'status_change' | 'committee_note'

export type AppNotification = {
  id: string
  user_id: string
  ticket_id: string | null
  kind: NotificationKind
  title: string
  body: string | null
  read_at: string | null
  created_at: string
}

/** Ticket joined with the flat and author rows the lists display. */
export type TicketWithRelations = Ticket & {
  flats: Pick<Flat, 'label'> | null
  profiles: Pick<Profile, 'name' | 'mobile' | 'resident_type'> | null
}

export const CATEGORY_LABEL: Record<TicketCategory, string> = {
  complaint: 'Complaint',
  suggestion: 'Suggestion',
  enquiry: 'Enquiry',
}

export const STATUS_LABEL: Record<TicketStatus, string> = {
  new: 'New',
  in_progress: 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
}

export const ROLE_LABEL: Record<UserRole, string> = {
  resident: 'Resident',
  committee: 'Committee',
  admin: 'Admin',
}
