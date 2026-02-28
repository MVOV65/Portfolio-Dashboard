import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/chart': {
        target: 'https://query1.finance.yahoo.com',
        changeOrigin: true,
        rewrite: (path) => {
          const url = new URL(path, 'http://localhost');
          const symbol = url.searchParams.get('symbol') ?? '';
          return `/v8/finance/chart/${encodeURIComponent(symbol)}?range=30d&interval=1d&includePrePost=false`;
        },
        secure: true,
      },
    },
  },
})
