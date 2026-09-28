/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import legacy from '@vitejs/plugin-legacy';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { legacyCss } from './legacy-css';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Browser code always calls relative `/v1/...`; the dev server proxies to the API.
  const apiTarget = env.API_PROXY_TARGET ?? 'http://127.0.0.1:5001';

  return {
    plugins: [
      react(),
      tailwindcss(),
      // Older browsers (iOS 12+, Android WebView/Chrome 64+, Samsung Internet 9+; targets in
      // package.json `browserslist`): syntax down-levelled + core-js polyfills for modern chunks,
      // and a SystemJS legacy bundle for browsers without ES-module support.
      legacy({ modernPolyfills: true, renderLegacyChunks: true }),
      legacyCss(),
      VitePWA({
        registerType: 'autoUpdate',
        // Registered manually in main.tsx so the Android (Capacitor) build skips the service worker.
        injectRegister: false,
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
          // 'any': tablets/desktops (admin panel) must be able to rotate; phones follow the device.
          orientation: 'any',
          background_color: '#F8FAFC',
          theme_color: '#177A50',
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          ],
        },
        workbox: {
          // Catalog images are large — cache at runtime instead of precaching.
          globIgnores: ['**/catalog/**', '**/*-legacy-*.js'],
          // Web Push handler (src/lib/webPush.ts) — self-hosted, no Firebase script in the worker.
          importScripts: ['push-sw.js'],
          navigateFallbackDenylist: [/^\/v1\//],
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.pathname.startsWith('/catalog/'),
              handler: 'CacheFirst',
              options: { cacheName: 'catalog-images', expiration: { maxEntries: 400 } },
            },
            {
              // Brand logos / product images served publicly (local API or Firebase Storage).
              urlPattern: ({ url }) =>
                url.pathname.includes('/v1/files/public/') ||
                ((url.hostname === 'firebasestorage.googleapis.com' ||
                  url.hostname === 'storage.googleapis.com') &&
                  /(brands|products)(%2F|\/)/.test(url.pathname)),
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'catalog-remote-images',
                expiration: { maxEntries: 500, maxAgeSeconds: 30 * 24 * 3600 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              // Read-only learner data: show last known state offline (M3 error state), never cache writes.
              urlPattern: ({ url, request }) =>
                request.method === 'GET' && /\/v1\/me\/(home|packages)/.test(url.pathname),
              handler: 'NetworkFirst',
              options: {
                cacheName: 'api-me',
                networkTimeoutSeconds: 6,
                expiration: { maxEntries: 60, maxAgeSeconds: 7 * 24 * 3600 },
                cacheableResponse: { statuses: [200] },
              },
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
    preview: {
      host: '0.0.0.0',
      port: 4173,
      allowedHosts: true,
      proxy: { '/v1': { target: apiTarget, changeOrigin: true } },
    },
    test: {
      environment: 'jsdom',
      globals: false,
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      css: false,
    },
  };
});
