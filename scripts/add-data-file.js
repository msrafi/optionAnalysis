#!/usr/bin/env node

/**
 * Script to add new data files to the optionAnalysis dashboard
 * Usage: node scripts/add-data-file.js <csv-file-path> [timestamp]
 * 
 * Examples:
 * node scripts/add-data-file.js new-data.csv
 * node scripts/add-data-file.js new-data.csv "2024-01-15T14:30:00"
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function generateDataFilename(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  
  return `options_data_${year}-${month}-${day}_${hour}-${minute}.csv`;
}

function updateDataFilesAPI(filename, timestamp) {
  const apiPath = path.join(__dirname, '../public/api/data-files');
  
  let files = [];
  if (fs.existsSync(apiPath)) {
    try {
      const content = fs.readFileSync(apiPath, 'utf8');
      files = JSON.parse(content);
    } catch (error) {
      console.warn('Warning: Could not parse existing data-files API, starting fresh');
    }
  }
  
  // Add new file entry
  const fileEntry = {
    name: filename,
    size: 0, // Will be updated when file is copied
    timestamp: timestamp.toISOString()
  };
  
  // Remove existing entry with same name if it exists
  files = files.filter(f => f.name !== filename);
  
  // Add new entry
  files.push(fileEntry);
  
  // Sort by timestamp (most recent first)
  files.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  
  // Write back to file
  fs.writeFileSync(apiPath, JSON.stringify(files, null, 2));
  console.log(`Updated API endpoint with ${files.length} files`);
}

function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage: node scripts/add-data-file.js <csv-file-path> [timestamp]');
    console.log('');
    console.log('Examples:');
    console.log('  node scripts/add-data-file.js new-data.csv');
    console.log('  node scripts/add-data-file.js new-data.csv "2024-01-15T14:30:00"');
    process.exit(1);
  }
  
  const csvFilePath = args[0];
  const timestampArg = args[1];
  
  // Validate input file exists
  if (!fs.existsSync(csvFilePath)) {
    console.error(`Error: File '${csvFilePath}' does not exist`);
    process.exit(1);
  }
  
  // Parse timestamp
  let timestamp;
  if (timestampArg) {
    timestamp = new Date(timestampArg);
    if (isNaN(timestamp.getTime())) {
      console.error(`Error: Invalid timestamp '${timestampArg}'`);
      process.exit(1);
    }
  } else {
    timestamp = new Date();
  }
  
  // Generate filename
  const filename = generateDataFilename(timestamp);
  const dataDir = path.join(__dirname, '../data');
  const destinationPath = path.join(dataDir, filename);
  
  // Ensure data directory exists
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log('Created data directory');
  }
  
  // Copy file
  try {
    fs.copyFileSync(csvFilePath, destinationPath);
    const stats = fs.statSync(destinationPath);
    console.log(`Copied file to: ${destinationPath}`);
    console.log(`File size: ${stats.size} bytes`);
  } catch (error) {
    console.error(`Error copying file: ${error.message}`);
    process.exit(1);
  }
  
  // Update API endpoint
  updateDataFilesAPI(filename, timestamp);
  
  console.log('');
  console.log('✅ Successfully added data file!');
  console.log(`📁 File: ${filename}`);
  console.log(`📅 Timestamp: ${timestamp.toISOString()}`);
  console.log(`📊 Location: ${destinationPath}`);
  console.log('');
  
  // Automatically trigger combine script to append new data
  console.log('🔄 Running combine script to append new data...');
  try {
    const combineScript = path.join(__dirname, 'combineDataFiles.js');
    
    // Run the combine script
    execSync(`node ${combineScript}`, { 
      stdio: 'inherit',
      cwd: path.join(__dirname, '..')
    });
    
    console.log('');
    console.log('✅ Data has been appended to combined file!');
  } catch (error) {
    console.error('');
    console.error('⚠️  Warning: Failed to run combine script automatically.');
    console.error('   You can manually run: node scripts/combineDataFiles.js');
    console.error(`   Error: ${error.message}`);
  }
  
  console.log('');
  console.log('🔄 Refresh your dashboard to see the new data');
}

// Run main when script is executed directly
try {
  main();
} catch (error) {
  console.error('Fatal error:', error);
  process.exit(1);
}

export { generateDataFilename, updateDataFilesAPI };
