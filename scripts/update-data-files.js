#!/usr/bin/env node

/**
 * Script to automatically update the data files list
 * This script scans the data directory and updates the mock API file
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '../data');
const API_FILE = path.join(__dirname, '../public/api/data-files');

/**
 * Parse timestamp from filename
 * Expected format: options_data_YYYY-MM-DD_HH-MM.csv
 */
function parseTimestampFromFilename(filename) {
  try {
    const match = filename.match(/options_data_(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2})\.csv/);
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
 * Scan data directory and generate file list
 */
function scanDataDirectory() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      console.log('Data directory does not exist, creating it...');
      fs.mkdirSync(DATA_DIR, { recursive: true });
      return [];
    }

    const files = fs.readdirSync(DATA_DIR);
    const csvFiles = files.filter(file => file.endsWith('.csv'));
    
    const fileList = csvFiles.map(filename => {
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
    console.error('Error scanning data directory:', error);
    return [];
  }
}

/**
 * Update the API file with current data files
 */
function updateApiFile() {
  try {
    const fileList = scanDataDirectory();
    
    // Ensure public directory exists
    const publicDir = path.dirname(API_FILE);
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }
    
    // Write the updated file list
    fs.writeFileSync(API_FILE, JSON.stringify(fileList, null, 2));
    
    console.log(`✅ Updated data files list with ${fileList.length} files:`);
    fileList.forEach(file => {
      console.log(`   - ${file.name} (${(file.size / 1024).toFixed(1)}KB, ${file.timestamp})`);
    });
    
    return fileList;
  } catch (error) {
    console.error('Error updating API file:', error);
    return [];
  }
}

/**
 * Watch for new files and auto-update
 */
function watchForChanges() {
  console.log('👀 Watching for new CSV files in data directory...');
  
  if (!fs.existsSync(DATA_DIR)) {
    console.log('Data directory does not exist, creating it...');
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  
  fs.watch(DATA_DIR, (eventType, filename) => {
    if (filename && filename.endsWith('.csv')) {
      console.log(`📁 Detected ${eventType} of ${filename}`);
      setTimeout(() => {
        updateApiFile();
      }, 1000); // Wait 1 second for file to be fully written
    }
  });
}

// Main execution
const args = process.argv.slice(2);

if (args.includes('--watch')) {
  updateApiFile(); // Initial update
  watchForChanges();
} else {
  updateApiFile();
}

export {
  scanDataDirectory,
  updateApiFile,
  watchForChanges
};
