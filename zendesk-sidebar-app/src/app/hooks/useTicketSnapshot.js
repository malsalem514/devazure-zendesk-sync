import { useCallback, useEffect, useRef, useState } from 'react'
import { loadTicketSnapshot, subscribeToTicketChanges } from '../lib/zendesk.js'

export function useTicketSnapshot(client) {
  const [snapshot, setSnapshot] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const cancelledRef = useRef(false)
  const refreshTimerRef = useRef(null)

  const refresh = useCallback(async () => {
    if (refreshTimerRef.current) {
      window.clearTimeout(refreshTimerRef.current)
      refreshTimerRef.current = null
    }

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
  }, [client])

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
      unsubscribe()
    }
  }, [client, refresh, scheduleRefresh])

  return { snapshot, loading, error, refresh }
}
