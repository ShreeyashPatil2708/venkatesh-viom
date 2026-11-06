import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from './auth'
import { registerPush } from './push'
import { supabase } from './supabase'

type NotificationState = {
  unread: number
  refresh: () => Promise<void>
}

const NotificationContext = createContext<NotificationState>({
  unread: 0,
  refresh: async () => {},
})

/** How often the bell re-checks while the app is open. */
const POLL_MS = 60_000

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { session, profile } = useAuth()
  const [unread, setUnread] = useState(0)
  const approved = profile?.status === 'approved'

  const refresh = useCallback(async () => {
    if (!session || !approved) {
      setUnread(0)
      return
    }
    const { count } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .is('read_at', null)
    setUnread(count ?? 0)
  }, [session, approved])

  // Push only matters once they are through the approval gate; before that
  // there is nothing to tell them about.
  useEffect(() => {
    if (!session || !approved) return
    let cleanup: (() => void) | undefined
    void registerPush(session.user.id).then((fn) => {
      cleanup = fn
    })
    return () => cleanup?.()
  }, [session, approved])

  useEffect(() => {
    void refresh()
    if (!session || !approved) return

    const timer = setInterval(() => void refresh(), POLL_MS)
    // Coming back to the app is the moment people expect the count to be right.
    const onFocus = () => void refresh()
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [refresh, session, approved])

  const value = useMemo(() => ({ unread, refresh }), [unread, refresh])
  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>
}

export function useNotifications(): NotificationState {
  return useContext(NotificationContext)
}
