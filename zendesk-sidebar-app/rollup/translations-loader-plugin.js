import fs from 'node:fs/promises'
import path, { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const translationsRoot = path.resolve(__dirname, '../src/translations')

function translationFlatten(object, currentKeys = []) {
  const result = {}

  Object.keys(object).forEach((key) => {
    const value = object[key]

    if (typeof value === 'object' && value !== null) {
      if (value.title && value.value) {
        const flattenedKey = [...currentKeys, key].join('.')
        result[flattenedKey] = value.value
      } else {
        Object.assign(result, translationFlatten(value, [...currentKeys, key]))
      }
      return
    }

    const flattenedKey = [...currentKeys, key].join('.')
    result[flattenedKey] = value
  })

  return result
}

export default function TranslationsLoader() {
  return {
    name: 'translations-loader',
    async transform(_, id) {
      if (!id.endsWith('.json') || !id.startsWith(translationsRoot)) {
        return null
      }

      const contentFile = await fs.readFile(id)
      const translations = JSON.parse(contentFile)

      return {
        code: `export default ${JSON.stringify(translationFlatten(translations))};`,
        map: null
      }
    }
  }
}
