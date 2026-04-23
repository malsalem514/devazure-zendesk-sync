import { createContext, useState } from 'react'

export const ClientContext = createContext(null)

export function ClientProvider({ children }) {
  const [client] = useState(() => window.ZAFClient.init())

  return <ClientContext.Provider value={client}>{children}</ClientContext.Provider>
}
