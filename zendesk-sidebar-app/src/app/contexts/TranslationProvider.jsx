import { createContext, useEffect, useState } from 'react'
import { useClient } from '../hooks/useClient.js'
import I18n from '../../lib/i18n.js'

export const TranslationContext = createContext(null)

const i18n = new I18n()

export function TranslationProvider({ children }) {
  const client = useClient()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      const { currentUser } = await client.get('currentUser')
      const locale = currentUser?.locale || 'en'
      await i18n.loadTranslations(locale)

      if (!cancelled) {
        setLoading(false)
      }
    }

    load().catch(() => {
      if (!cancelled) {
        setLoading(false)
      }
    })

    return () => {
      cancelled = true
    }
  }, [client])

  if (loading) {
    return null
  }

  return <TranslationContext.Provider value={{ i18n }}>{children}</TranslationContext.Provider>
}
