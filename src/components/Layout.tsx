import type { ReactNode } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useNotifications } from '../lib/notifications'

const SOCIETY_NAME = import.meta.env.VITE_SOCIETY_NAME || 'Venkatesh Viom'

function Icon({ path }: { path: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-6"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  )
}

const ICONS = {
  requests: 'M8 6h12M8 12h12M8 18h12M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  notices: 'M4 5h16v11H8l-4 3V5Z',
  profile: 'M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM5 20a7 7 0 0 1 14 0',
  admin: 'M4 7h16M4 12h16M4 17h10M18.5 17h.01',
}

const TABS = [
  { to: '/', label: 'Requests', icon: ICONS.requests, end: true },
  { to: '/notices', label: 'Notices', icon: ICONS.notices },
  { to: '/profile', label: 'Profile', icon: ICONS.profile },
] as const

export function Layout() {
  const { isCommittee } = useAuth()
  const { unread } = useNotifications()
  const navigate = useNavigate()
  const tabs = isCommittee
    ? [...TABS, { to: '/admin', label: 'Admin', icon: ICONS.admin, end: false }]
    : TABS

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-line bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
          <span className="flex-1 truncate font-bold tracking-tight">{SOCIETY_NAME}</span>
          <button
            onClick={() => navigate('/notifications')}
            aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
            className="relative -mr-2 rounded-full p-2 text-muted transition hover:bg-canvas hover:text-ink"
          >
            <Icon path="M18 16v-5a6 6 0 1 0-12 0v5l-1.5 2.5h15L18 16ZM10 20.5a2 2 0 0 0 4 0" />
            {unread > 0 && (
              <span className="absolute top-0.5 right-0.5 flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-5 pb-28">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-white pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-3xl">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={'end' in tab ? tab.end : false}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition ${
                  isActive ? 'text-brand-600' : 'text-muted'
                }`
              }
            >
              <Icon path={tab.icon} />
              {tab.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}

/** Centred card used by the login, sign-up and waiting screens. */
export function CenteredCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col justify-center px-4 py-10">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-2xl bg-brand-600 text-2xl font-bold text-white">
            {SOCIETY_NAME.charAt(0).toUpperCase()}
          </div>
          <h1 className="text-xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
        </div>
        <div className="card p-5">{children}</div>
      </div>
    </div>
  )
}

export { SOCIETY_NAME }
