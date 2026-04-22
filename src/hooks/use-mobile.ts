import * as React from "react"

const MOBILE_BREAKPOINT = 768

// Lazily created MediaQueryList — only accessed in browser environments.
let mql: MediaQueryList | undefined

function getMql(): MediaQueryList {
  if (!mql) {
    mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
  }
  return mql
}

function subscribe(onStoreChange: () => void): () => void {
  const m = getMql()
  m.addEventListener("change", onStoreChange)
  return () => m.removeEventListener("change", onStoreChange)
}

function getClientSnapshot(): boolean {
  return window.innerWidth < MOBILE_BREAKPOINT
}

function getServerSnapshot(): boolean {
  // During SSR the window is unavailable; default to non-mobile so the server
  // and initial client renders agree on the desktop layout.
  return false
}

/**
 * Returns whether the viewport is narrower than the mobile breakpoint.
 *
 * Uses useSyncExternalStore so the value is read synchronously on the first
 * client render, eliminating the mount-time flicker caused by the old
 * useState + useEffect two-render pattern.
 */
export function useIsMobile(): boolean {
  return React.useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot)
}
