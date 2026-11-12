import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { signature } from '@/summary'
import type { ConnectionState, ResultRecord, ResultsResponse } from '@/types'

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

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Eases a displayed number towards its target so a changed count is noticed, not missed. */
export function useCountUp(target: number, durationMs = 450): number {
  const [value, setValue] = useState(target)
  const shown = useRef(target)
  useEffect(() => {
    const from = shown.current
    if (from === target) return
    if (prefersReducedMotion()) {
      shown.current = target
      setValue(target)
      return
    }
    let frame = 0
    const start = performance.now()
    const step = (time: number) => {
      const progress = Math.min(1, (time - start) / durationMs)
      const eased = 1 - (1 - progress) ** 3
      shown.current = Math.round(from + (target - from) * eased)
      setValue(shown.current)
      if (progress < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [target, durationMs])
  return value
}

/** The last section whose top has scrolled past the sticky header, for sidebar highlighting. */
export function useActiveSection<T extends string>(ids: readonly T[], offsetPx = 120): T {
  const [active, setActive] = useState<T>(ids[0])
  useEffect(() => {
    let frame = 0
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        let current = ids[0]
        for (const id of ids) {
          const element = document.getElementById(id)
          if (element && element.getBoundingClientRect().top <= offsetPx) current = id
        }
        if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) current = ids[ids.length - 1]
        setActive(current)
      })
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [ids, offsetPx])
  return active
}
