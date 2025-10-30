// Service Worker for caching static assets
const CACHE_NAME = 'option-analysis-v6';
const BASE_PATH = '/optionAnalysis';

// Install event - cache static assets (non-blocking)
self.addEventListener('install', (event) => {
  // Skip waiting to activate new service worker immediately
  self.skipWaiting();
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Caching static assets');
        // Only cache essential assets, don't block if some fail
        return Promise.allSettled([
          cache.add(`${BASE_PATH}/`),
          cache.add(`${BASE_PATH}/index.html`)
        ]).then(results => {
          results.forEach((result, index) => {
            if (result.status === 'rejected') {
              console.warn(`Failed to cache asset ${index}:`, result.reason);
            }
          });
        });
      })
      .catch((error) => {
        console.error('Failed to cache static assets:', error);
      })
  );
});

// Fetch event - serve from cache when possible
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip non-http requests
  if (!event.request.url.startsWith('http')) {
    return;
  }

  // Don't cache API requests - always fetch fresh
  if (event.request.url.includes('/api/')) {
    return;
  }

  // For navigation requests, always try network first
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          // If network fails, try cache
          return caches.match(`${BASE_PATH}/index.html`);
        })
    );
    return;
  }

  // For other assets, try cache first, then network
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Return cached version if available
        if (response) {
          return response;
        }

        // Otherwise fetch from network
        return fetch(event.request)
          .then((networkResponse) => {
            // Don't cache if not a valid response
            if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
              return networkResponse;
            }

            // Clone the response
            const responseToCache = networkResponse.clone();

            // Cache the response for future use (async, don't block)
            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              })
              .catch(err => console.warn('Failed to cache response:', err));

            return networkResponse;
          })
          .catch(() => {
            // If fetch fails, return a proper error response instead of blank
            return new Response('Network error', { status: 408, statusText: 'Request Timeout' });
          });
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      // Take control of all pages immediately
      self.clients.claim(),
      // Clean up old caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log('Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
    ])
  );
});
