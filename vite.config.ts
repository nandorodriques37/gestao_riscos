import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { devApiPlugin } from './vite-plugin-dev-api'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), devApiPlugin()],
})
