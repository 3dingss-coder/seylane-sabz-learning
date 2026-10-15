/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
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
    // ffmpeg.wasm ships its own worker/wasm loader; pre-bundling would break its relative URLs.
    optimizeDeps: { exclude: ['@ffmpeg/ffmpeg'] },
    plugins: [
      // The Persian font is otherwise discovered only after the CSS and the app JS have run, so the
      // first text paint waits for it (it started ~4 s into a slow-network load). Preload it so it
      // downloads in parallel with the JS. File names are hashed, hence resolved from the bundle.
      {
        name: 'preload-arabic-font',
        apply: 'build',
        transformIndexHtml: {
          order: 'post',
          handler(_html, ctx) {
            const file = Object.keys(ctx.bundle ?? {}).find((f) =>
              /vazirmatn-arabic-wght-normal.*\.woff2$/.test(f),
            );
            if (!file) return [];
            return [
              {
                tag: 'link',
                attrs: {
                  rel: 'preload',
                  as: 'font',
                  type: 'font/woff2',
                  crossorigin: '',
                  href: `/${file}`,
                },
                injectTo: 'head-prepend',
              },
            ];
          },
        },
      },
      {
        // The splash mascot is the Largest Contentful Paint. As a separate file it queued behind the
        // JS/CSS on slow phones (~1.7 s load delay + duration); inlined (~20 kB) it paints with the HTML.
        name: 'inline-boot-mascot',
        transformIndexHtml: {
          order: 'pre',
          handler(html) {
            const b64 = readFileSync(
              fileURLToPath(new URL('./src/assets/mascot-boot.webp', import.meta.url)),
            ).toString('base64');
            return html.replace('__BOOT_MASCOT__', `data:image/webp;base64,${b64}`);
          },
        },
      },
      react(),
      tailwindcss(),
      // Older browsers (iOS 12+, Android WebView/Chrome 64+, Samsung Internet 9+; targets in
      // package.json `browserslist`): syntax down-levelled + core-js polyfills for modern chunks,
      // and a SystemJS legacy bundle for browsers without ES-module support. Many field devices
      // (older Android phones) cannot run a 2023+-only build and see a blank/unstyled page.
      legacy({
        // Browsers older than `modernTargets` get the SystemJS legacy bundle; current browsers load
        // the small modern build with only the few polyfills they still lack (was 130 KB for all).
        modernTargets: ['chrome >= 90', 'edge >= 90', 'firefox >= 90', 'safari >= 15'],
        // `true` pulled in every core-js module missing from Chrome 90 / Safari 15, including 2025
        // proposals (Iterator helpers, Set methods, JSON.parse source...) the app never calls; that
        // chunk cost ~1 s of main-thread time on a throttled phone. Only the small, widely used
        // gaps are listed; add a module here if code starts using a newer built-in.
        modernPolyfills: [
          'es.array.at',
          'es.array.find-last',
          'es.array.find-last-index',
          'es.object.has-own',
          'es.string.at-alternative',
          'es.error.cause',
          'es.array.to-reversed',
          'es.array.to-sorted',
          'es.array.to-spliced',
          'es.array.with',
          'web.structured-clone',
        ],
        renderLegacyChunks: true,
      }),
      legacyCss(),
      VitePWA({
        registerType: 'autoUpdate',
        // Registered manually in main.tsx so the Android (Capacitor) build skips the service worker.
        injectRegister: false,
        includeAssets: [
          'push-icons/push-icon-192.png',
          'push-icons/push-icon-512.png',
          'push-icons/maskable-512.png',
        ],
        manifest: {
          name: 'آکادمی سیلانه',
          short_name: 'آکادمی سیلانه',
          description: 'آموزش محصولات آکادمی سیلانه برای بازاریاب‌ها',
          lang: 'fa',
          dir: 'rtl',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          // 'any': tablets/desktops (admin panel) must be able to rotate; phones follow the device.
          orientation: 'any',
          background_color: '#0F5338',
          theme_color: '#177A50',
          icons: [
            {
              src: 'push-icons/push-icon-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'push-icons/push-icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'push-icons/maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          // `injectRegister: false` stops vite-plugin-pwa from applying its autoUpdate defaults, so a
          // new service worker used to *wait* until every tab/PWA window was closed — users kept
          // seeing the old version for days. Activate immediately and take over open pages; the
          // register code (main.tsx) then reloads the page onto the new build.
          skipWaiting: true,
          clientsClaim: true,
          cleanupOutdatedCaches: true,
          // Catalog images and the rarely used ExcelJS export chunk are fetched on demand.
          // ExcelJS (~940 KB) must not be downloaded during PWA installation for marketers.
          globIgnores: ['**/catalog/**', '**/ffmpeg/**', '**/exceljs*.js', '**/*-legacy-*.js'],
          // Web Push handler (src/lib/webPush.ts) — self-hosted, no Firebase script in the worker.
          importScripts: ['push-sw.js'],
          navigateFallbackDenylist: [/^\/v1\//],
          runtimeCaching: [
            {
              // Cache the large ExcelJS chunk only after a user explicitly requests an export.
              urlPattern: ({ url }) => /\/assets\/exceljs[^/]*\.js$/.test(url.pathname),
              handler: 'CacheFirst',
              options: {
                cacheName: 'excel-export',
                expiration: { maxEntries: 2 },
                cacheableResponse: { statuses: [200] },
              },
            },
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
      port: 3000,
      allowedHosts: true,
      proxy: { '/v1': { target: apiTarget, changeOrigin: true } },
    },
    preview: {
      host: '0.0.0.0',
      port: 3000,
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
