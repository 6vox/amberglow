import { resolve } from 'node:path'
import { defineConfig } from 'vite'

/**
 * GitHub Pages: /amberglow/
 * Netlify Deploy Preview: / （VITE_BASE または NETLIFY で切替）
 */
const base = process.env.VITE_BASE
  ?? (process.env.NETLIFY === 'true' ? '/' : '/amberglow/')

export default defineConfig({
  base,
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        play: resolve(__dirname, 'play/index.html'),
      },
    },
  },
})
