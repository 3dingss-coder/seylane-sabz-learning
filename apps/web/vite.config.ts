/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Browser code always calls relative `/v1/...`; the dev server proxies to the API.
  const apiTarget = env.API_PROXY_TARGET ?? 'http://127.0.0.1:5001';

  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
        manifest: {
          name: 'سیلانه‌سبز لرنینگ',
          short_name: 'سیلانه‌سبز لرنینگ',
          description: 'آموزش محصولات سیلانه‌سبز برای بازاریاب‌ها',
          lang: 'fa',
          dir: 'rtl',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'portrait',
          background_color: '#F8FAFC',
          theme_color: '#1B8A5A',
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          ],
        },
        workbox: {
          // Catalog images are large — cache at runtime instead of precaching.
          globIgnores: ['**/catalog/**'],
          navigateFallbackDenylist: [/^\/v1\//],
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.pathname.startsWith('/catalog/'),
              handler: 'CacheFirst',
              options: { cacheName: 'catalog-images', expiration: { maxEntries: 400 } },
            },
          ],
        },
      }),
    ],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      allowedHosts: true,
      proxy: { '/v1': { target: apiTarget, changeOrigin: true } },
    },
    preview: { host: '0.0.0.0', port: 4173, allowedHosts: true },
    test: {
      environment: 'jsdom',
      globals: false,
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      css: false,
    },
  };
});
