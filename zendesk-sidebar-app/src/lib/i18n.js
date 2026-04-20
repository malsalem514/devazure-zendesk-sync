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
    const intentLocales = I18n.getRetries(locale)

    do {
      try {
        const importedTranslations = await this.tryRequire(intentLocales[0])
        if (importedTranslations?.default) {
          this.translations = importedTranslations.default
          break
        }
      } catch {
        intentLocales.shift()
      }
    } while (intentLocales.length)
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
