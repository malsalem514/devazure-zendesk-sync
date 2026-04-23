class I18n {
  constructor() {
    this.translations = {}
  }

  static getRetries(locale) {
    return [locale, locale.replace(/-.+$/, ''), 'en']
  }

  async tryRequire(locale) {
    try {
      const result = await import(`../translations/${locale}.json`)
      return result
    } catch {
      return null
    }
  }

  async loadTranslations(locale) {
    const intentLocales = [...new Set(I18n.getRetries(locale))]

    for (const intentLocale of intentLocales) {
      const importedTranslations = await this.tryRequire(intentLocale)
      if (importedTranslations?.default) {
        this.translations = importedTranslations.default
        return
      }
    }
  }

  t(key, context = {}) {
    if (typeof key !== 'string') {
      throw new Error(`Translation key must be a string, got: ${typeof key}`)
    }

    const template = this.translations[key]
    if (!template) {
      throw new Error(`Missing translation: ${key}`)
    }

    if (typeof template !== 'string') {
      throw new Error(`Invalid translation for key: ${key}`)
    }

    return template.replace(/{{(.*?)}}/g, (_, match) => context[match] || '')
  }
}

export default I18n
