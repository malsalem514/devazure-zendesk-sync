import { useEffect, useState } from 'react'
import { loadTicketSnapshot, subscribeToTicketChanges } from '../lib/zendesk.js'

export function useTicketSnapshot(client) {
  const [snapshot, setSnapshot] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    const refresh = async () => {
      try {
        const nextSnapshot = await loadTicketSnapshot(client)

        if (!cancelled) {
          setSnapshot(nextSnapshot)
          setError(null)
          setLoading(false)
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError)
          setLoading(false)
        }
      }
    }

    refresh()
    const unsubscribe = subscribeToTicketChanges(client, refresh)

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [client])

  return {
    snapshot,
    loading,
    error
  }
}
