import { useContext } from 'react'
import { TranslationContext } from '../contexts/TranslationProvider.jsx'

export function useI18n() {
  const context = useContext(TranslationContext)

  if (!context) {
    throw new Error('useI18n must be used within a TranslationProvider')
  }

  return context.i18n
}
