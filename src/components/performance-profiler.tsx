"use client"

import { Profiler, type PropsWithChildren } from "react"

type PerfInteractionRecord = {
  kind: "interaction"
  name: string
  detail?: string
  duration: number
  timestamp: number
}

type PerfRenderRecord = {
  kind: "render"
  id: string
  phase: "mount" | "update" | "nested-update"
  actualDuration: number
  baseDuration: number
  startTime: number
  commitTime: number
  timestamp: number
}

type MailAppPerfStore = {
  interactions: PerfInteractionRecord[]
  renders: PerfRenderRecord[]
}

declare global {
  interface Window {
    __MAIL_APP_PERF__?: MailAppPerfStore
  }
}

function isPerformanceBaselineEnabled(): boolean {
  if (typeof window === "undefined") {
    return false
  }

  const searchParams = new URLSearchParams(window.location.search)
  if (searchParams.get("perf") === "1") {
    return true
  }

  try {
    return window.localStorage.getItem("mail-app-perf") === "1"
  } catch {
    return false
  }
}

function getPerfStore(): MailAppPerfStore | null {
  if (!isPerformanceBaselineEnabled() || typeof window === "undefined") {
    return null
  }

  window.__MAIL_APP_PERF__ ??= {
    interactions: [],
    renders: [],
  }

  return window.__MAIL_APP_PERF__
}

export function startInteractionTrace(name: string, detail?: string): () => void {
  const store = getPerfStore()
  if (!store || typeof performance === "undefined") {
    return () => undefined
  }

  const traceId = `${name}-${performance.now().toFixed(3)}`
  const startMark = `${traceId}-start`
  const endMark = `${traceId}-end`
  const measureName = `${traceId}-measure`

  performance.mark(startMark)

  return () => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        performance.mark(endMark)
        performance.measure(measureName, startMark, endMark)
        const duration = performance.getEntriesByName(measureName).at(-1)?.duration ?? 0

        store.interactions.push({
          kind: "interaction",
          name,
          detail,
          duration,
          timestamp: Date.now(),
        })

        performance.clearMarks(startMark)
        performance.clearMarks(endMark)
        performance.clearMeasures(measureName)
      })
    })
  }
}

export function PerformanceProfiler({
  id,
  children,
}: PropsWithChildren<{ id: string }>) {
  const store = getPerfStore()

  if (!store) {
    return children
  }

  return (
    <Profiler
      id={id}
      onRender={(profilerId, phase, actualDuration, baseDuration, startTime, commitTime) => {
        store.renders.push({
          kind: "render",
          id: profilerId,
          phase,
          actualDuration,
          baseDuration,
          startTime,
          commitTime,
          timestamp: Date.now(),
        })
      }}
    >
      {children}
    </Profiler>
  )
}