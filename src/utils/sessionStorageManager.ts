/**
 * Central session storage management for the Option Analysis application
 * Handles clearing all session storage caches when the application closes
 */

import { clearAllSessionCaches } from './fileLoader';
import { clearAllDataParserCaches } from './dataParser';
import { clearPriceCache } from './stockPrice';

/**
 * Clear all session storage caches used by the application
 */
export function clearAllApplicationCaches(): void {
  try {
    // Clear file loader caches
    clearAllSessionCaches();
    
    // Clear data parser caches
    clearAllDataParserCaches();
    
    // Clear price cache
    clearPriceCache();
    
    // Clear any other session storage items that might exist
    const keysToRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith('optionAnalysis_')) {
        keysToRemove.push(key);
      }
    }
    
    keysToRemove.forEach(key => {
      try {
        sessionStorage.removeItem(key);
      } catch (error) {
        if (import.meta.env.DEV) {
          console.warn(`Failed to remove session storage key ${key}:`, error);
        }
      }
    });
    
    if (import.meta.env.DEV) {
      console.log('🧹 All application session storage cleared');
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Failed to clear application caches:', error);
    }
  }
}

/**
 * Initialize session storage cleanup on application close
 * This should be called once when the application starts
 */
export function initializeSessionStorageCleanup(): void {
  // Clear session storage when the page is about to unload
  const handleBeforeUnload = () => {
    clearAllApplicationCaches();
  };
  
  // Clear session storage when the page is unloaded
  const handleUnload = () => {
    clearAllApplicationCaches();
  };
  
  // Clear session storage when the page is hidden (mobile browsers)
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      clearAllApplicationCaches();
    }
  };
  
  // Add event listeners
  window.addEventListener('beforeunload', handleBeforeUnload);
  window.addEventListener('unload', handleUnload);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  
  // Also clear on page hide (for mobile browsers)
  window.addEventListener('pagehide', handleBeforeUnload);
  
  if (import.meta.env.DEV) {
    console.log('🔧 Session storage cleanup initialized');
  }
}

/**
 * Get all session storage keys used by the application
 */
export function getApplicationSessionStorageKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key && key.startsWith('optionAnalysis_')) {
      keys.push(key);
    }
  }
  return keys;
}

/**
 * Get the total size of application session storage in bytes
 */
export function getApplicationSessionStorageSize(): number {
  let totalSize = 0;
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key && key.startsWith('optionAnalysis_')) {
      const value = sessionStorage.getItem(key);
      if (value) {
        totalSize += key.length + value.length;
      }
    }
  }
  return totalSize;
}
