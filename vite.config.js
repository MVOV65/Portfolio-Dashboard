import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // Load .env so VITE_FRED_API_KEY is available in the proxy rewrite
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    build: {
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom'],
            grid:   ['react-grid-layout'],
            charts: ['recharts'],
          },
        },
      },
    },
    server: {
      proxy: {
        // ── /api/sentiment → CNN Fear & Greed (was /api/feargreed) ──────────
        '/api/sentiment': {
          target:      'https://production.dataviz.cnn.io',
          changeOrigin: true,
          rewrite:     () => '/index/fearandgreed/graphdata',
          headers:     { Referer: 'https://www.cnn.com/' },
          secure:      true,
        },

        // ── Keep old /api/feargreed alias so nothing breaks during transition ─
        '/api/feargreed': {
          target:      'https://production.dataviz.cnn.io',
          changeOrigin: true,
          rewrite:     () => '/index/fearandgreed/graphdata',
          headers:     { Referer: 'https://www.cnn.com/' },
          secure:      true,
        },

        // ── /api/fred → FRED observations (per-series, local dev fallback) ──
        // The EconomicCalendar component detects the absence of `obsMap` and
        // falls back to serial per-series fetching using this proxy.
        '/api/fred': {
          target:      'https://api.stlouisfed.org',
          changeOrigin: true,
          rewrite: (path) => {
            const url      = new URL(path, 'http://localhost');
            const seriesId = url.searchParams.get('seriesId') ?? '';
            const apiKey   = env.VITE_FRED_API_KEY ?? '';
            return (
              `/fred/series/observations?series_id=${encodeURIComponent(seriesId)}` +
              `&api_key=${apiKey}&file_type=json&sort_order=desc&limit=3`
            );
          },
          secure: true,
        },

        // ── /api/news → Finnhub company-news (local dev only, single ticker) ─
        // In production this is served from Redis. In dev, the EconomicCalendar
        // serial-fallback path is used; NewsFeed will get an empty response here
        // since the proxy can't replicate the multi-ticker loop. That's acceptable
        // in dev — run the cron manually or seed Redis to test news locally.
        '/api/news': {
          target:      'https://finnhub.io',
          changeOrigin: true,
          rewrite:     () => `/api/v1/news?category=general&token=${env.VITE_FINNHUB_API_KEY}`,
          secure:      true,
        },

        // ── /api/chart → Yahoo Finance ────────────────────────────────────────
        '/api/chart': {
          target:      'https://query1.finance.yahoo.com',
          changeOrigin: true,
          rewrite: (path) => {
            const url    = new URL(path, 'http://localhost');
            const symbol = url.searchParams.get('symbol') ?? '';
            return `/v8/finance/chart/${encodeURIComponent(symbol)}?range=30d&interval=1d&includePrePost=false`;
          },
          secure: true,
        },
      },
    },
  };
});
