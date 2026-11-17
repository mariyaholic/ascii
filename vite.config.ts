import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        // Updates are offered in-app (see useServiceWorkerUpdate) instead of
        // reloading underneath a render session.
        registerType: 'prompt',
        injectRegister: null,
        includeAssets: [
          'icon.svg',
          'apple-touch-icon.png',
          'pwa-192x192.png',
          'pwa-512x512.png',
          'pwa-maskable-512x512.png',
        ],
        manifest: {
          id: '/',
          name: 'PhosphorGrid — Pixel & ASCII Studio',
          short_name: 'PhosphorGrid',
          description:
            'Convert images into resolution-aware pixelated and ASCII/Unicode art with Bayer & error-diffusion dithering.',
          lang: 'en',
          dir: 'ltr',
          categories: ['graphics', 'photo', 'utilities', 'productivity'],
          theme_color: '#060907',
          background_color: '#060907',
          display: 'standalone',
          orientation: 'any',
          launch_handler: { client_mode: 'navigate-existing' },
          prefer_related_applications: false,
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
          shortcuts: [
            {
              name: 'Open Studio',
              short_name: 'Studio',
              description: 'Load an image and start rendering',
              url: '/?panel=studio',
              icons: [{ src: '/pwa-192x192.png', sizes: '192x192' }],
            },
            {
              name: 'Batch Converter',
              short_name: 'Batch',
              description: 'Convert a folder of images into a ZIP',
              url: '/?panel=batch',
              icons: [{ src: '/pwa-192x192.png', sizes: '192x192' }],
            },
            {
              name: 'Palettes',
              short_name: 'Palettes',
              description: 'Browse and edit colour palettes',
              url: '/?panel=palettes',
              icons: [{ src: '/pwa-192x192.png', sizes: '192x192' }],
            },
            {
              name: 'Presets',
              short_name: 'Presets',
              description: 'Recall a saved studio look',
              url: '/?panel=presets',
              icons: [{ src: '/pwa-192x192.png', sizes: '192x192' }],
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,jpeg,webp,woff,woff2}'],
          // The bundled sample photographs are a few hundred KB each; keep them
          // available for the offline canvas.
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//],
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: false,
          runtimeCaching: [
            {
              // The style assistant is a live model call: never serve a stale one.
              urlPattern: /\/api\/style-assistant$/,
              handler: 'NetworkOnly',
              method: 'POST',
            },
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              // Imported source photos are immutable once hashed.
              urlPattern: ({ url, sameOrigin }: { url: URL; sameOrigin: boolean }) =>
                sameOrigin && /\.(?:png|jpe?g|webp|gif|svg)$/i.test(url.pathname),
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'pg-media-cache',
                expiration: {
                  maxEntries: 60,
                  maxAgeSeconds: 60 * 60 * 24 * 30,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          // A dev-mode worker would cache module graphs across HMR edits and
          // immediately report a stale update; test the PWA from a build.
          enabled: false,
          type: 'module',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
