import { useContext, useEffect, useState } from 'react'
import { ClientContext } from '../contexts/ClientProvider.jsx'

export function useClient() {
  const client = useContext(ClientContext)

  if (!client) {
    throw new Error('useClient must be used within a ClientProvider')
  }

  return client
}

export function useLocation() {
  const client = useClient()
  const [location, setLocation] = useState(null)

  useEffect(() => {
    let cancelled = false

    client.context().then((data) => {
      if (!cancelled) {
        setLocation(data.location)
      }
    })

    return () => {
      cancelled = true
    }
  }, [client])

  return location
}
