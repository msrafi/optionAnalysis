import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { initializeSessionStorageCleanup } from './utils/sessionStorageManager'

// Register service worker for better performance (non-blocking)
if ('serviceWorker' in navigator) {
  // Use requestIdleCallback if available, otherwise setTimeout to not block rendering
  const registerSW = () => {
    try {
      const basePath = import.meta.env.BASE_URL;
      navigator.serviceWorker.register(`${basePath}sw.js`)
        .then((registration) => {
          console.log('SW registered: ', registration);
          
          // Check for updates
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            newWorker?.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // New service worker available, prompt user to reload
                console.log('🔄 New service worker available. Please reload the page.');
              }
            });
          });
        })
        .catch((registrationError) => {
          // Don't log as error - SW registration failure is non-critical
          console.log('SW registration failed (non-critical): ', registrationError);
        });
    } catch (error) {
      // Silently fail - service worker is optional
      console.log('SW registration error (non-critical):', error);
    }
  };

  // Delay service worker registration to not block initial render
  if ('requestIdleCallback' in window && typeof requestIdleCallback !== 'undefined') {
    (window as any).requestIdleCallback(registerSW, { timeout: 2000 });
  } else {
    window.addEventListener('load', () => {
      setTimeout(registerSW, 1000);
    });
  }
  
  // Add function to clear all caches and unregister service worker
  (window as any).clearAllCaches = async () => {
    try {
      // Unregister all service workers
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(reg => reg.unregister()));
      
      // Clear all caches
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));
      
      // Clear session storage
      sessionStorage.clear();
      
      // Clear local storage
      localStorage.clear();
      
      console.log('✅ All caches cleared!');
      alert('All caches cleared! Please reload the page.');
      window.location.reload();
    } catch (error) {
      console.error('Failed to clear caches:', error);
    }
  };
}

// Initialize session storage cleanup
initializeSessionStorageCleanup();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
