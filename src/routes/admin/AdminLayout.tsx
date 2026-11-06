import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'

export function AdminLayout() {
  const { isAdmin } = useAuth()
  const [pending, setPending] = useState(0)

  useEffect(() => {
    if (!isAdmin) return
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .then(({ count }) => setPending(count ?? 0))
  }, [isAdmin])

  const tabs = [
    { to: '/admin', label: 'Requests', end: true },
    ...(isAdmin
      ? [{ to: '/admin/members', label: 'Members', end: false, badge: pending }]
      : []),
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
            {'badge' in tab && (tab.badge ?? 0) > 0 && (
              <span className="ml-1.5 rounded-full bg-red-600 px-1.5 text-[11px] font-bold text-white">
                {tab.badge}
              </span>
            )}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  )
}
