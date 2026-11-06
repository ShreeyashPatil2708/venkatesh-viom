import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../../lib/auth'

export function AdminLayout() {
  const { isAdmin } = useAuth()
  const tabs = [
    { to: '/admin', label: 'Requests', end: true },
    ...(isAdmin ? [{ to: '/admin/members', label: 'Members', end: false }] : []),
    { to: '/admin/notices', label: 'Notices', end: false },
    { to: '/admin/flats', label: 'Flats', end: false },
  ]

  return (
    <div className="space-y-4">
      <nav className="-mx-1 flex gap-1 overflow-x-auto pb-1">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              `shrink-0 rounded-full px-3.5 py-2 text-sm font-semibold transition ${
                isActive ? 'bg-brand-600 text-white' : 'bg-white text-muted ring-1 ring-line'
              }`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  )
}
