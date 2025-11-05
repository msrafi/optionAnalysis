/**
 * File loading utilities for handling multiple CSV files
 */

export interface FileInfo {
  filename: string;
  timestamp: Date;
  size: number;
}

export interface LoadedFileData {
  filename: string;
  timestamp: Date;
  data: string;
  error?: string;
}

/**
 * Parse timestamp from filename
 * Expected format: options_data_YYYY-MM-DD_HH-MM.csv or darkpool_data_YYYY-MM-DD_HH-MM.csv
 */
export function parseTimestampFromFilename(filename: string): Date | null {
  try {
    // Extract timestamp from filename: options_data_2024-01-15_10-00.csv, option_data_2025-10-17_15-45.csv, or darkpool_data_2025-10-17_15-00.csv
    const match = filename.match(/(?:options_data|option_data|darkpool_data)_(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2})\.csv/);
    if (!match) return null;
    
    const [, dateStr, timeStr] = match;
    const [year, month, day] = dateStr.split('-').map(Number);
    const [hour, minute] = timeStr.split('-').map(Number);
    
    return new Date(year, month - 1, day, hour, minute);
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn(`Failed to parse timestamp from filename: ${filename}`, error);
    }
    return null;
  }
}

/**
 * Get all CSV files from the data directory
 */
export async function getDataFiles(_bustCache: boolean = false): Promise<FileInfo[]> {
  try {
    // Try to load from the API file first (dynamically generated)
    // Always use cache busting to ensure we get the latest file list
    const baseUrl = import.meta.env.BASE_URL;
    const cacheBuster = `?t=${Date.now()}&r=${Math.random()}`;
    const response = await fetch(`${baseUrl}api/data-files.json${cacheBuster}`, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
    
    if (response.ok) {
      const apiData = await response.json();
      if (Array.isArray(apiData) && apiData.length > 0) {
        if (import.meta.env.DEV) {
          console.log(`📁 Loaded ${apiData.length} data files from API`);
        }
        return apiData.map((file: any) => ({
          filename: file.name,
          timestamp: new Date(file.timestamp),
          size: file.size
        }));
      }
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('Failed to load data files from API, falling back to hardcoded list:', error);
    }
  }

  // Fallback: Since we use combined file, we don't need individual file list
  // Return empty array as fallback - the app loads from combined file
  if (import.meta.env.DEV) {
    console.warn('⚠️ API endpoint not available, but using combined file so this is OK');
  }
  
  return [];
}

/**
 * Get all dark pool CSV files from the data directory
 */
export async function getDarkPoolDataFiles(): Promise<FileInfo[]> {
  // Use hardcoded list of available dark pool files for now
  const knownDarkPoolFiles = [
    'darkpool_data_2025-10-17_15-00.csv'
  ];

  return knownDarkPoolFiles.map(filename => ({
    filename,
    timestamp: parseTimestampFromFilename(filename) || new Date(),
    size: 0 // Will be updated when file is loaded
  })).sort((a: FileInfo, b: FileInfo) => 
    b.timestamp.getTime() - a.timestamp.getTime() // Most recent first
  );
}

/**
 * Load a single CSV file with cache busting
 */
export async function loadCSVFile(filename: string, bustCache: boolean = false): Promise<LoadedFileData> {
  try {
    // Add cache-busting query parameter when needed
    // Use timestamp only (not random) to allow browser to deduplicate simultaneous requests
    const cacheBuster = bustCache ? `?t=${Date.now()}` : '';
    const baseUrl = import.meta.env.BASE_URL;
    const response = await fetch(`${baseUrl}data/${filename}${cacheBuster}`, {
      cache: bustCache ? 'no-store' : 'default',
      headers: bustCache ? {
        'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0'
      } : {}
    });
    
    if (!response.ok) {
      throw new Error(`Failed to load ${filename}: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.text();
    const timestamp = parseTimestampFromFilename(filename);
    
    return {
      filename,
      timestamp: timestamp || new Date(),
      data
    };
  } catch (error) {
    return {
      filename,
      timestamp: new Date(),
      data: '',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// Session storage keys for caching
const FILE_CACHE_KEY = 'optionAnalysis_fileCache';
const DARKPOOL_FILE_CACHE_KEY = 'optionAnalysis_darkPoolFileCache';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Helper functions for session storage
function getSessionCache(key: string): Map<string, { data: LoadedFileData; timestamp: number }> {
  try {
    const cached = sessionStorage.getItem(key);
    if (cached) {
      const parsed = JSON.parse(cached);
      const map = new Map<string, { data: LoadedFileData; timestamp: number }>();
      for (const [k, v] of Object.entries(parsed)) {
        map.set(k, v as { data: LoadedFileData; timestamp: number });
      }
      return map;
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('Failed to load from session storage:', error);
    }
  }
  return new Map<string, { data: LoadedFileData; timestamp: number }>();
}

function setSessionCache(key: string, cache: Map<string, { data: LoadedFileData; timestamp: number }>): void {
  try {
    const obj = Object.fromEntries(cache);
    sessionStorage.setItem(key, JSON.stringify(obj));
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('Failed to save to session storage:', error);
    }
  }
}

function clearSessionCache(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('Failed to clear session storage:', error);
    }
  }
}

/**
 * Clear all session storage caches for the application
 */
export function clearAllSessionCaches(): void {
  clearSessionCache(FILE_CACHE_KEY);
  clearSessionCache(DARKPOOL_FILE_CACHE_KEY);
  if (import.meta.env.DEV) {
    console.log('🧹 All session storage caches cleared');
  }
}

/**
 * Clear the file loading cache for options data
 */
export function clearFileCache(): void {
  clearSessionCache(FILE_CACHE_KEY);
  if (import.meta.env.DEV) {
    console.log('🧹 Options file cache cleared');
  }
}

/**
 * Clear the file loading cache for dark pool data
 */
export function clearDarkPoolFileCache(): void {
  clearSessionCache(DARKPOOL_FILE_CACHE_KEY);
  if (import.meta.env.DEV) {
    console.log('🧹 Dark pool file cache cleared');
  }
}

/**
 * Load metadata for the combined file
 */
export async function loadCombinedFileMetadata(): Promise<{
  generatedAt: string;
  sourceFiles: {
    count: number;
    latest: string;
    latestModified: string;
  };
  combinedFile: {
    records: {
      uniqueAfterDedup: number;
    };
  };
} | null> {
  try {
    const baseUrl = import.meta.env.BASE_URL;
    // Use a single timestamp per load session to allow browser deduplication
    const cacheBuster = `?t=${Math.floor(Date.now() / 1000)}`; // Round to second for better deduplication
    const response = await fetch(`${baseUrl}data/options_data_combined.metadata.json${cacheBuster}`, {
      cache: 'no-store'
    });
    
    if (!response.ok) {
      return null;
    }
    
    return await response.json();
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('Failed to load metadata:', error);
    }
    return null;
  }
}

/**
 * Load the combined CSV file with caching
 * Now loads a single pre-combined file instead of multiple files
 */
export async function loadAllDataFiles(bustCache: boolean = false): Promise<LoadedFileData[]> {
  try {
    const COMBINED_FILENAME = 'options_data_combined.csv';
    const now = Date.now();
    
    // Get cache from session storage
    const fileCache = getSessionCache(FILE_CACHE_KEY);
    
    // Check cache first (unless busting)
    if (!bustCache) {
      const cached = fileCache.get(COMBINED_FILENAME);
      if (cached && (now - cached.timestamp) < CACHE_DURATION) {
        if (import.meta.env.DEV) {
          console.log('✓ Using cached combined data file');
        }
        return [cached.data];
      }
    }
    
    // Load the combined file
    if (import.meta.env.DEV) {
      console.log('📂 Loading combined data file...');
    }
    
    const result = await loadCSVFile(COMBINED_FILENAME, bustCache);
    
    if (result.error) {
      console.error(`Failed to load combined file: ${result.error}`);
      return [];
    }
    
    // For combined file, use current date as timestamp (since filename doesn't have timestamp)
    // The actual data timestamps are preserved in the CSV data
    const combinedResult: LoadedFileData = {
      ...result,
      timestamp: new Date() // Use current date for combined file
    };
    
    // Update cache
    fileCache.set(COMBINED_FILENAME, { data: combinedResult, timestamp: now });
    setSessionCache(FILE_CACHE_KEY, fileCache);
    
    if (import.meta.env.DEV) {
      console.log(`✓ Loaded combined data file (${(result.data.length / 1024).toFixed(2)} KB)`);
    }
    
    return [combinedResult];
  } catch (error) {
    console.error('Failed to load combined data file:', error);
    return [];
  }
}

/**
 * Load all dark pool CSV files from the data directory with caching
 */
export async function loadAllDarkPoolDataFiles(bustCache: boolean = false): Promise<LoadedFileData[]> {
  try {
    const files = await getDarkPoolDataFiles();
    const now = Date.now();
    
    // Get dark pool cache from session storage
    const darkPoolFileCache = getSessionCache(DARKPOOL_FILE_CACHE_KEY);
    
    // If busting cache, skip cache check and load all files fresh
    if (bustCache) {
      if (import.meta.env.DEV) {
        console.log('🔄 Cache busting enabled - loading all dark pool files fresh...');
      }
      const loadPromises = files.map(file => loadCSVFile(file.filename, true));
      const results = await Promise.all(loadPromises);
      
      // Update dark pool cache with fresh data
      results.forEach(result => {
        if (!result.error) {
          darkPoolFileCache.set(result.filename, { data: result, timestamp: now });
        }
      });
      
      // Save updated cache to session storage
      setSessionCache(DARKPOOL_FILE_CACHE_KEY, darkPoolFileCache);
      
      const successful = results.filter(result => !result.error);
      if (import.meta.env.DEV) {
        console.log(`✓ Loaded ${successful.length} dark pool files fresh (cache bypassed)`);
      }
      return successful;
    }
    
    // Normal caching behavior
    const cachedResults: LoadedFileData[] = [];
    const filesToLoad: string[] = [];
    
    files.forEach(file => {
      const cached = darkPoolFileCache.get(file.filename);
      if (cached && (now - cached.timestamp) < CACHE_DURATION) {
        cachedResults.push(cached.data);
      } else {
        filesToLoad.push(file.filename);
      }
    });
    
    // Load only uncached files
    let newResults: LoadedFileData[] = [];
    if (filesToLoad.length > 0) {
      const loadPromises = filesToLoad.map(filename => loadCSVFile(filename, false));
      newResults = await Promise.all(loadPromises);
      
      // Update dark pool cache
      newResults.forEach(result => {
        if (!result.error) {
          darkPoolFileCache.set(result.filename, { data: result, timestamp: now });
        }
      });
      
      // Save updated cache to session storage
      setSessionCache(DARKPOOL_FILE_CACHE_KEY, darkPoolFileCache);
    }
    
    const allResults = [...cachedResults, ...newResults];
    
    // Filter out files with errors and log them
    const successful = allResults.filter(result => !result.error);
    const failed = allResults.filter(result => result.error);
    
    if (import.meta.env.DEV && failed.length > 0) {
      console.warn('Failed to load some dark pool data files:', failed);
    }
    
    if (import.meta.env.DEV) {
      console.log(`Successfully loaded ${successful.length} dark pool data files (${cachedResults.length} cached, ${newResults.filter(r => !r.error).length} new)`);
    }
    return successful;
  } catch (error) {
    console.error('Failed to load dark pool data files:', error);
    return [];
  }
}


/**
 * Preload data files in the background
 */
export function preloadDataFiles(): Promise<LoadedFileData[]> {
  return loadAllDataFiles();
}

/**
 * Generate filename for new data file based on current timestamp
 */
export function generateDataFilename(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  
  return `options_data_${year}-${month}-${day}_${hour}-${minute}.csv`;
}

/**
 * Get the most recent data file timestamp
 */
export function getMostRecentTimestamp(files: FileInfo[]): Date | null {
  if (files.length === 0) return null;
  
  return files.reduce((latest, file) => 
    file.timestamp > latest ? file.timestamp : latest, 
    files[0].timestamp
  );
}

/**
 * Get files from the last N hours
 */
export function getRecentFiles(files: FileInfo[], hours: number = 24): FileInfo[] {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
  return files.filter(file => file.timestamp >= cutoff);
}
