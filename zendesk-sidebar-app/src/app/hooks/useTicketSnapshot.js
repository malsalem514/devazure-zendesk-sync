import { useCallback, useEffect, useRef, useState } from 'react'
import {
  applyBackendSummaryToSnapshot,
  loadTicketSnapshot,
  subscribeToTicketChanges
} from '../lib/zendesk.js'

export function useTicketSnapshot(client) {
  const [snapshot, setSnapshot] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const cancelledRef = useRef(false)
  const refreshTimerRef = useRef(null)
  const inFlightRefreshRef = useRef(null)
  const queuedRefreshRef = useRef(false)

  const refresh = useCallback(async () => {
    if (refreshTimerRef.current) {
      window.clearTimeout(refreshTimerRef.current)
      refreshTimerRef.current = null
    }

    if (inFlightRefreshRef.current) {
      queuedRefreshRef.current = true
      return inFlightRefreshRef.current
    }

    const refreshPromise = (async () => {
      try {
        const nextSnapshot = await loadTicketSnapshot(client)
        if (!cancelledRef.current) {
          setSnapshot(nextSnapshot)
          setError(null)
          setLoading(false)
        }
      } catch (nextError) {
        if (!cancelledRef.current) {
          setError(nextError)
          setLoading(false)
        }
      }
    })()

    inFlightRefreshRef.current = refreshPromise
    try {
      await refreshPromise
    } finally {
      inFlightRefreshRef.current = null
      if (queuedRefreshRef.current && !cancelledRef.current) {
        queuedRefreshRef.current = false
        await refresh()
      }
    }
  }, [client])

  const applyBackendSummary = useCallback((summary) => {
    setSnapshot((current) => applyBackendSummaryToSnapshot(current, summary))
    setError(null)
    setLoading(false)
  }, [])

  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current) {
      window.clearTimeout(refreshTimerRef.current)
    }

    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null
      refresh()
    }, 300)
  }, [refresh])

  useEffect(() => {
    cancelledRef.current = false
    refresh()
    const unsubscribe = subscribeToTicketChanges(client, scheduleRefresh)
    return () => {
      cancelledRef.current = true
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current)
        refreshTimerRef.current = null
      }
      queuedRefreshRef.current = false
      unsubscribe()
    }
  }, [client, refresh, scheduleRefresh])

  return { snapshot, loading, error, refresh, applyBackendSummary }
}
