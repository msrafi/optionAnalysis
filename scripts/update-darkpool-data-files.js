#!/usr/bin/env node

/**
 * Script to automatically update the dark pool data files list
 * This script scans the data directory for darkpool files and updates the mock API file
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '../data');
const PUBLIC_API_FILE = path.join(__dirname, '../public/api/darkpool-data-files.json');
const DIST_API_FILE = path.join(__dirname, '../dist/api/darkpool-data-files.json');

/**
 * Parse timestamp from filename
 * Expected format: darkpool_data_YYYY-MM-DD_HH-MM.csv
 */
function parseTimestampFromFilename(filename) {
  try {
    const match = filename.match(/darkpool_data_(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2})\.csv/);
    if (!match) return null;
    
    const [, dateStr, timeStr] = match;
    const [year, month, day] = dateStr.split('-').map(Number);
    const [hour, minute] = timeStr.split('-').map(Number);
    
    return new Date(year, month - 1, day, hour, minute);
  } catch (error) {
    console.warn(`Failed to parse timestamp from filename: ${filename}`, error);
    return null;
  }
}

/**
 * Get file size in bytes
 */
function getFileSize(filePath) {
  try {
    const stats = fs.statSync(filePath);
    return stats.size;
  } catch (error) {
    console.warn(`Failed to get file size for: ${filePath}`, error);
    return 0;
  }
}

/**
 * Scan data directory and generate dark pool file list
 */
function scanDarkPoolDataDirectory() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      console.log('Data directory does not exist, creating it...');
      fs.mkdirSync(DATA_DIR, { recursive: true });
      return [];
    }

    const files = fs.readdirSync(DATA_DIR);
    // Filter for darkpool CSV files only
    const darkPoolFiles = files.filter(file => 
      file.endsWith('.csv') && file.startsWith('darkpool_data_')
    );
    
    const fileList = darkPoolFiles.map(filename => {
      const filePath = path.join(DATA_DIR, filename);
      const timestamp = parseTimestampFromFilename(filename);
      const size = getFileSize(filePath);
      
      return {
        name: filename,
        size: size,
        timestamp: timestamp ? timestamp.toISOString() : new Date().toISOString()
      };
    });

    // Sort by timestamp (newest first)
    fileList.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    return fileList;
  } catch (error) {
    console.error('Error scanning dark pool data directory:', error);
    return [];
  }
}

/**
 * Update the API file with current dark pool data files
 */
function updateDarkPoolApiFile() {
  try {
    const fileList = scanDarkPoolDataDirectory();
    
    // Update public directory (for dev mode)
    const publicDir = path.dirname(PUBLIC_API_FILE);
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }
    fs.writeFileSync(PUBLIC_API_FILE, JSON.stringify(fileList, null, 2));
    
    // Also update dist directory (for production builds)
    const distDir = path.dirname(DIST_API_FILE);
    if (!fs.existsSync(distDir)) {
      fs.mkdirSync(distDir, { recursive: true });
    }
    fs.writeFileSync(DIST_API_FILE, JSON.stringify(fileList, null, 2));
    
    console.log(`✅ Updated dark pool data files list with ${fileList.length} files in both public/ and dist/ directories:`);
    fileList.forEach(file => {
      console.log(`   - ${file.name} (${(file.size / 1024).toFixed(1)}KB, ${file.timestamp})`);
    });
    
    return fileList;
  } catch (error) {
    console.error('Error updating dark pool API file:', error);
    return [];
  }
}

/**
 * Watch for new dark pool files and auto-update
 */
function watchForDarkPoolChanges() {
  console.log('👀 Watching for new dark pool CSV files in data directory...');
  
  if (!fs.existsSync(DATA_DIR)) {
    console.log('Data directory does not exist, creating it...');
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  
  // Watch for changes in data directory
  fs.watch(DATA_DIR, (eventType, filename) => {
    if (filename && filename.endsWith('.csv') && filename.startsWith('darkpool_data_')) {
      console.log(`📁 Detected ${eventType} of dark pool file: ${filename}`);
      setTimeout(() => {
        updateDarkPoolApiFile();
      }, 1000); // Wait 1 second for file to be fully written
    }
  });
  
  // Also watch for changes in public and dist API files
  fs.watch(path.dirname(PUBLIC_API_FILE), (eventType, filename) => {
    if (filename && filename === 'darkpool-data-files.json') {
      console.log(`📄 Dark pool API file updated, syncing to dist/...`);
      setTimeout(() => {
        try {
          if (fs.existsSync(PUBLIC_API_FILE)) {
            const content = fs.readFileSync(PUBLIC_API_FILE, 'utf8');
            const distDir = path.dirname(DIST_API_FILE);
            if (!fs.existsSync(distDir)) {
              fs.mkdirSync(distDir, { recursive: true });
            }
            fs.writeFileSync(DIST_API_FILE, content);
          }
        } catch (error) {
          console.warn('Failed to sync to dist:', error);
        }
      }, 100);
    }
  });
}

// Main execution
const args = process.argv.slice(2);

if (args.includes('--watch')) {
  updateDarkPoolApiFile(); // Initial update
  watchForDarkPoolChanges();
} else {
  updateDarkPoolApiFile();
}

export {
  scanDarkPoolDataDirectory,
  updateDarkPoolApiFile,
  watchForDarkPoolChanges
};
