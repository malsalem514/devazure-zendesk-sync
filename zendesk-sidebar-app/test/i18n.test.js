import { describe, expect, it } from 'vitest'
import I18n from '../src/lib/i18n.js'

describe('I18n', () => {
  it('falls back to English for regional or unavailable locales', async () => {
    const i18n = new I18n()

    await i18n.loadTranslations('fr-CA')

    expect(i18n.t('ticket_sidebar.title')).toBe('Azure DevOps')
  })
})
