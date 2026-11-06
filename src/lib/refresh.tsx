import { createContext, useCallback, useContext, useMemo, useState } from 'react'

type RefreshState = {
  /** Screens include this in their effect deps to re-fetch on a pull. */
  refreshKey: number
  refresh: () => void
}

const RefreshContext = createContext<RefreshState>({ refreshKey: 0, refresh: () => {} })

export function RefreshProvider({ children }: { children: React.ReactNode }) {
  const [refreshKey, setRefreshKey] = useState(0)
  const refresh = useCallback(() => setRefreshKey((n) => n + 1), [])
  const value = useMemo(() => ({ refreshKey, refresh }), [refreshKey, refresh])
  return <RefreshContext.Provider value={value}>{children}</RefreshContext.Provider>
}

export function useRefresh(): RefreshState {
  return useContext(RefreshContext)
}
