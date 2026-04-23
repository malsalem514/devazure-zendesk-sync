import { createContext, useEffect, useState } from 'react'

export const ClientContext = createContext(null)

export function ClientProvider({ children }) {
  const [client] = useState(() => window.ZAFClient.init())
  const [appRegistered, setAppRegistered] = useState(false)

  useEffect(() => {
    const handleRegistered = () => {
      setAppRegistered(true)
    }

    client.on('app.registered', handleRegistered)

    return () => {
      if (typeof client.off === 'function') {
        client.off('app.registered', handleRegistered)
      }
    }
  }, [client])

  if (!appRegistered) {
    return null
  }

  return <ClientContext.Provider value={client}>{children}</ClientContext.Provider>
}
