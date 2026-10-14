import { createHash } from 'node:crypto';
import { fileURLToPath, URL } from 'node:url';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * Emits `sw.js`, a service worker that stores every file of the build on the
 * first visit, so the app (including its workers and the WASM encoder) keeps
 * working with the internet switched off.
 */
const offlineServiceWorker = (): Plugin => ({
  name: 'offline-service-worker',
  apply: 'build',
  generateBundle(_, bundle) {
    const files = ['./', 'index.html', ...Object.keys(bundle).filter((name) => name !== 'index.html')];
    const version = createHash('sha256').update(files.join('\n')).digest('hex').slice(0, 12);
    this.emitFile({ type: 'asset', fileName: 'sw.js', source: serviceWorkerSource(files, version) });
  },
});

const serviceWorkerSource = (files: string[], version: string) => `\
const CACHE = 'audiobook-converter-${version}';
const FILES = ${JSON.stringify(files)};

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key.startsWith('audiobook-converter-') && key !== CACHE).map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    // The page: fresh when online (so updates arrive), the saved copy when offline.
    event.respondWith(fetch(request).catch(() => caches.match('./index.html', { ignoreSearch: true })));
    return;
  }
  // Everything else has content-hashed names, so the saved copy is always right.
  event.respondWith(caches.match(request).then((saved) => saved || fetch(request)));
});
`;

export default defineConfig({
  // Relative base so the build works under any GitHub Pages sub-path.
  base: './',
  plugins: [offlineServiceWorker()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  worker: { format: 'es' },
  build: { target: 'es2022' },
  test: { environment: 'node' },
});
