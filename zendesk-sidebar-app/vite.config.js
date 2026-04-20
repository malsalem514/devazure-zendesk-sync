import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'
import process from 'node:process'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import TranslationsLoader from './rollup/translations-loader-plugin.js'
import StaticCopy from './rollup/static-copy-plugin.js'
import { changeLocation } from './rollup/modifiers/manifest.js'
import { extractMarketplaceTranslation } from './rollup/modifiers/translations.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export default ({ mode }) => {
  process.env = { ...process.env, ...loadEnv(mode, process.cwd()) }

  return defineConfig({
    base: './',
    plugins: [
      react(),
      TranslationsLoader(),
      StaticCopy({
        targets: [
          {
            src: resolve(__dirname, 'src/manifest.json'),
            dest: '../',
            modifier: changeLocation
          },
          {
            src: resolve(__dirname, 'src/translations/en.json'),
            dest: '../translations',
            modifier: extractMarketplaceTranslation
          }
        ]
      })
    ],
    root: 'src',
    test: {
      include: ['../{test,spec}/**/*.{test,spec}.{js,jsx}'],
      exclude: ['**/node_modules/**', '**/dist/**'],
      globals: true,
      environment: 'jsdom'
    },
    build: {
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'src/index.html')
        },
        output: {
          entryFileNames: '[name].js',
          chunkFileNames: '[name].js',
          assetFileNames: '[name].[ext]'
        },
        watch: {
          include: 'src/**'
        }
      },
      outDir: resolve(__dirname, 'dist/assets'),
      emptyOutDir: true
    }
  })
}
