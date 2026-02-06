import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // Listen on all network interfaces
    port: 5173, // Default Vite port
    strictPort: false, // Allow fallback to next available port if 5173 is taken
    proxy: {
      '/identities': {
        target: 'http://localhost:8001',
        changeOrigin: true,
        secure: false,
      },
      '/enrollments': {
        target: 'http://localhost:8002',
        changeOrigin: true,
        secure: false,
      },
      '/departments': {
        target: 'http://localhost:8003',
        changeOrigin: true,
        secure: false,
      },
      '/sports-participations': {
        target: 'http://localhost:8004',
        changeOrigin: true,
        secure: false,
      },
      '/event-configurations': {
        target: 'http://localhost:8005',
        changeOrigin: true,
        secure: false,
      },
      '/schedulings': {
        target: 'http://localhost:8006',
        changeOrigin: true,
        secure: false,
      },
      '/scorings': {
        target: 'http://localhost:8007',
        changeOrigin: true,
        secure: false,
      },
      '/reportings': {
        target: 'http://localhost:8008',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  preview: {
    port: 5173, // Preview server port
    host: '0.0.0.0',
  },
})

