import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath } from 'node:url'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxy = {
    '/api': {
      target: env.VITE_PROXY_TARGET || 'http://localhost:8020',
      changeOrigin: true,
    },
  }

  return {
    plugins: [
      vue(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'favicon.svg', 'apple-touch-icon-180x180.png'],
        manifest: {
          id: '/',
          name: 'Aplikasi Penjualan',
          short_name: 'Penjualan',
          description: 'Kasir, inventory, stok, closing harian, dan laporan penjualan',
          lang: 'id',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'any',
          theme_color: '#0f766e',
          background_color: '#f1f5f9',
          categories: ['business', 'finance'],
          icons: [
            { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
            { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
            { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//, /^\/up$/, /^\/storage\//],
        },
        devOptions: { enabled: false },
      }),
    ],
    // "npm run build:laravel": hasil build langsung ke backend/public (lihat scripts/build-laravel.mjs).
    build: mode === 'laravel'
      ? { outDir: env.LARAVEL_PATH ? `${env.LARAVEL_PATH}/public` : fileURLToPath(new URL('../backend/public', import.meta.url)), emptyOutDir: false }
      : {},
    server: { port: 5174, proxy },
    preview: { port: 4174, proxy },
  }
})
