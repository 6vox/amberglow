import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/amberglow/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        play: resolve(__dirname, 'play/index.html'),
      },
    },
  },
})
