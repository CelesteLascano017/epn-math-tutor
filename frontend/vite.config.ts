import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    // NOTE for backend integrators:
    // If you host your API on another origin during development you can proxy
    // it here to avoid CORS issues, e.g.:
    //
    // proxy: {
    //   '/api': { target: 'http://localhost:8000', changeOrigin: true },
    // },
  },
})
