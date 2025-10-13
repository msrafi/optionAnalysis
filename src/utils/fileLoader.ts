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
 * Expected format: options_data_YYYY-MM-DD_HH-MM.csv
 */
export function parseTimestampFromFilename(filename: string): Date | null {
  try {
    // Extract timestamp from filename: options_data_2024-01-15_10-00.csv
    const match = filename.match(/options_data_(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2})\.csv/);
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
export async function getDataFiles(): Promise<FileInfo[]> {
  try {
    // In a real application, you would fetch this from your backend
    // For now, we'll simulate by checking known files
    const response = await fetch('/api/data-files');
    
    if (!response.ok) {
      // Fallback to static file list for development
      return [
        {
          filename: 'options_data_2024-01-15_10-00.csv',
          timestamp: new Date('2024-01-15T10:00:00'),
          size: 0 // Will be updated when file is loaded
        }
      ];
    }
    
    const files = await response.json();
    return files.map((file: any) => ({
      filename: file.name,
      timestamp: parseTimestampFromFilename(file.name) || new Date(),
      size: file.size
    })).sort((a: FileInfo, b: FileInfo) => 
      b.timestamp.getTime() - a.timestamp.getTime() // Most recent first
    );
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('Failed to fetch data files list, using fallback:', error);
    }
    return [
      {
        filename: 'options_data_2024-01-15_10-00.csv',
        timestamp: new Date('2024-01-15T10:00:00'),
        size: 0
      }
    ];
  }
}

/**
 * Load a single CSV file with cache busting
 */
export async function loadCSVFile(filename: string, bustCache: boolean = false): Promise<LoadedFileData> {
  try {
    // Add cache-busting query parameter to force fresh load
    const cacheBuster = bustCache ? `?t=${Date.now()}` : '';
    const response = await fetch(`/data/${filename}${cacheBuster}`, {
      cache: bustCache ? 'no-store' : 'default',
      headers: {
        'Cache-Control': bustCache ? 'no-cache, no-store, must-revalidate' : 'default',
        'Pragma': bustCache ? 'no-cache' : 'default'
      }
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

// Cache for loaded files to avoid re-fetching
const fileCache = new Map<string, { data: LoadedFileData; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Load all CSV files from the data directory with caching
 */
export async function loadAllDataFiles(bustCache: boolean = false): Promise<LoadedFileData[]> {
  try {
    const files = await getDataFiles();
    const now = Date.now();
    
    // If busting cache, skip cache check and load all files fresh
    if (bustCache) {
      if (import.meta.env.DEV) {
        console.log('🔄 Cache busting enabled - loading all files fresh...');
      }
      const loadPromises = files.map(file => loadCSVFile(file.filename, true));
      const results = await Promise.all(loadPromises);
      
      // Update cache with fresh data
      results.forEach(result => {
        if (!result.error) {
          fileCache.set(result.filename, { data: result, timestamp: now });
        }
      });
      
      const successful = results.filter(result => !result.error);
      if (import.meta.env.DEV) {
        console.log(`✓ Loaded ${successful.length} files fresh (cache bypassed)`);
      }
      return successful;
    }
    
    // Normal caching behavior
    const cachedResults: LoadedFileData[] = [];
    const filesToLoad: string[] = [];
    
    files.forEach(file => {
      const cached = fileCache.get(file.filename);
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
      
      // Update cache
      newResults.forEach(result => {
        if (!result.error) {
          fileCache.set(result.filename, { data: result, timestamp: now });
        }
      });
    }
    
    const allResults = [...cachedResults, ...newResults];
    
    // Filter out files with errors and log them
    const successful = allResults.filter(result => !result.error);
    const failed = allResults.filter(result => result.error);
    
    if (import.meta.env.DEV && failed.length > 0) {
      console.warn('Failed to load some data files:', failed);
    }
    
    if (import.meta.env.DEV) {
      console.log(`Successfully loaded ${successful.length} data files (${cachedResults.length} cached, ${newResults.filter(r => !r.error).length} new)`);
    }
    return successful;
  } catch (error) {
    console.error('Failed to load data files:', error);
    return [];
  }
}

/**
 * Clear the file cache
 */
export function clearFileCache(): void {
  fileCache.clear();
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
