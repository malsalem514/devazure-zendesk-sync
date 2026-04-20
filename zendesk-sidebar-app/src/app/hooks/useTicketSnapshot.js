import { useCallback, useEffect, useRef, useState } from 'react'
import { loadTicketSnapshot, subscribeToTicketChanges } from '../lib/zendesk.js'

export function useTicketSnapshot(client) {
  const [snapshot, setSnapshot] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const cancelledRef = useRef(false)

  const refresh = useCallback(async () => {
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

  useEffect(() => {
    cancelledRef.current = false
    refresh()
    const unsubscribe = subscribeToTicketChanges(client, refresh)
    return () => {
      cancelledRef.current = true
      unsubscribe()
    }
  }, [client, refresh])

  return { snapshot, loading, error, refresh }
}
