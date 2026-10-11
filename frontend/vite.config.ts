import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "services": path.resolve(__dirname, "./src/services"),
      "components": path.resolve(__dirname, "./src/components"),
      "features": path.resolve(__dirname, "./src/features"),
      "hooks": path.resolve(__dirname, "./src/hooks"),
      "utils": path.resolve(__dirname, "./src/utils")
    }
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      // Keep supporting older saved profile URLs during local development.
      '/profile/avatar': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})

