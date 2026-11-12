import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { signature } from './summary'
import type { ConnectionState, ResultRecord, ResultsResponse } from './types'

const POLL_MS = 4000

/**
 * Polls the worker for results. Polling pauses while the tab is hidden, an
 * unchanged list does not re-render, and a failed request keeps the last
 * good data on screen while reporting the connection as offline.
 */
export function useResults(): { results: ResultRecord[] | null; state: ConnectionState; updatedAt: Date | null } {
  const [results, setResults] = useState<ResultRecord[] | null>(null)
  const [state, setState] = useState<ConnectionState>('connecting')
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const lastSignature = useRef<string | null>(null)

  const load = useCallback(async (signal: AbortSignal) => {
    try {
      const response = await fetch('/api/results', { cache: 'no-store', signal })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const body = (await response.json()) as ResultsResponse
      const next = Array.isArray(body.results) ? body.results : []
      const nextSignature = signature(next)
      if (nextSignature !== lastSignature.current) {
        lastSignature.current = nextSignature
        setResults(next)
      }
      setState('live')
      setUpdatedAt(new Date())
    } catch {
      if (!signal.aborted) setState('offline')
    }
  }, [])

  useEffect(() => {
    let controller = new AbortController()
    let timer: number | undefined
    const tick = async () => {
      controller = new AbortController()
      await load(controller.signal)
      if (!document.hidden) timer = window.setTimeout(tick, POLL_MS)
    }
    const onVisibility = () => {
      window.clearTimeout(timer)
      if (!document.hidden) void tick()
    }
    void tick()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      controller.abort()
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [load])

  return { results, state, updatedAt }
}

/** Tracks an element's content width so SVG can be drawn at real pixels. */
export function useElementWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [ref, width]
}

type Theme = 'light' | 'dark'
const THEME_KEY = 'occupancy-theme'

export function initialTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // Storage can be unavailable (private mode); fall back to the system.
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(initialTheme)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.documentElement.style.colorScheme = theme
  }, [theme])
  const toggle = useCallback(() => {
    setTheme(current => {
      const next = current === 'dark' ? 'light' : 'dark'
      try { localStorage.setItem(THEME_KEY, next) } catch { /* not persisted */ }
      return next
    })
  }, [])
  return [theme, toggle]
}

/** Re-renders every interval so relative times ("2 min ago") stay current. */
export function useNow(intervalMs = 15000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), intervalMs)
    return () => window.clearInterval(timer)
  }, [intervalMs])
  return now
}
