import { useEffect, useRef, useState } from 'react'
import { useNotifications } from '../lib/notifications'
import { useRefresh } from '../lib/refresh'

const TRIGGER_PX = 70
const MAX_PULL = 90

/**
 * The WebView has no browser chrome, so there is no native pull-to-refresh.
 * This adds the gesture people expect: drag down from the top of a list.
 */
export function PullToRefresh({ children }: { children: React.ReactNode }) {
  const { refresh } = useRefresh()
  const { refresh: refreshBell } = useNotifications()
  const [pull, setPull] = useState(0)
  const [busy, setBusy] = useState(false)
  const startY = useRef<number | null>(null)

  useEffect(() => {
    function onTouchStart(e: TouchEvent) {
      // Only arm the gesture when already at the very top of the page.
      startY.current = window.scrollY <= 0 ? e.touches[0].clientY : null
    }

    function onTouchMove(e: TouchEvent) {
      if (startY.current === null || busy) return
      const delta = e.touches[0].clientY - startY.current
      if (delta <= 0) {
        setPull(0)
        return
      }
      // Resist the drag so it feels anchored rather than loose.
      setPull(Math.min(delta * 0.45, MAX_PULL))
      if (e.cancelable) e.preventDefault()
    }

    async function onTouchEnd() {
      if (startY.current === null) return
      const pulled = pull
      startY.current = null
      setPull(0)
      if (pulled < TRIGGER_PX || busy) return

      setBusy(true)
      refresh()
      await refreshBell()
      // Hold the spinner briefly so the refresh reads as deliberate.
      setTimeout(() => setBusy(false), 500)
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend', onTouchEnd)
    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
    }
  }, [pull, busy, refresh, refreshBell])

  const offset = busy ? 40 : pull
  const ready = pull >= TRIGGER_PX

  return (
    <>
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-20 flex justify-center"
        style={{
          transform: `translateY(${offset}px)`,
          opacity: offset > 6 ? 1 : 0,
          transition: busy || offset === 0 ? 'transform .25s, opacity .25s' : 'none',
        }}
        aria-hidden={!busy}
      >
        <span className="mt-2 flex size-9 items-center justify-center rounded-full border border-line bg-white shadow-sm">
          <span
            className={`size-5 rounded-full border-2 border-brand-600 border-t-transparent ${
              busy ? 'animate-spin' : ''
            }`}
            style={{ transform: busy ? undefined : `rotate(${pull * 4}deg)`, opacity: ready || busy ? 1 : 0.5 }}
          />
        </span>
      </div>
      <div
        style={{
          transform: `translateY(${offset}px)`,
          transition: busy || offset === 0 ? 'transform .25s' : 'none',
        }}
      >
        {children}
      </div>
    </>
  )
}
