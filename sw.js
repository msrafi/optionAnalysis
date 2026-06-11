// Service Worker for caching static assets
const CACHE_NAME = 'option-analysis-v7';
const BASE_PATH = '/optionAnalysis';

// Install event - cache static assets (non-blocking)
self.addEventListener('install', (event) => {
  // Skip waiting to activate new service worker immediately
  self.skipWaiting();
  
  // Don't cache index.html during install - always fetch fresh
  // This prevents serving stale HTML files
  event.waitUntil(
    caches.open(CACHE_NAME).then(() => {
      console.log('Service worker cache initialized');
      // Don't pre-cache index.html - always fetch it fresh from network
      // This ensures users always get the latest version
    }).catch((error) => {
      console.error('Failed to initialize cache:', error);
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

  // For navigation requests, always try network first (never cache HTML)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      })
        .then(response => {
          // Don't cache HTML files - always fetch fresh
          return response;
        })
        .catch(() => {
          // If network fails, try cache as last resort
          return caches.match(`${BASE_PATH}/index.html`);
        })
    );
    return;
  }

  // Don't cache HTML files - always fetch fresh
  if (event.request.url.endsWith('.html') || event.request.url.endsWith('/')) {
    event.respondWith(
      fetch(event.request, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
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
