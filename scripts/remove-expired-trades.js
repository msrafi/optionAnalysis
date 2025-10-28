#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Check if an option has expired based on its expiry date
 * Expected format: "MM/DD/YYYY" (e.g., "10/10/2025")
 */
function isOptionExpired(expiryStr) {
  try {
    if (!expiryStr) return false;
    
    // Parse expiry date from MM/DD/YYYY format
    const parts = expiryStr.split('/');
    if (parts.length !== 3) return false;
    
    const month = parseInt(parts[0]) - 1; // JavaScript months are 0-indexed
    const day = parseInt(parts[1]);
    const year = parseInt(parts[2]);
    
    // Create expiry date at end of day (23:59:59) to ensure options expire after market close
    const expiryDate = new Date(year, month, day, 23, 59, 59);
    const today = new Date();
    
    // Option is expired if expiry date is before today
    return expiryDate < today;
  } catch (error) {
    console.warn(`Failed to parse expiry date: ${expiryStr}`, error);
    return false; // If we can't parse it, don't filter it out
  }
}

/**
 * Process a single CSV file to remove expired trades
 */
function processCSVFile(filePath) {
  try {
    console.log(`Processing: ${path.basename(filePath)}`);
    
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    
    if (lines.length <= 1) {
      console.log(`  Skipping empty file: ${path.basename(filePath)}`);
      return { processed: 0, removed: 0, total: 0 };
    }
    
    const header = lines[0];
    const dataLines = lines.slice(1);
    
    let processedCount = 0;
    let removedCount = 0;
    const validLines = [header]; // Keep header
    
    for (const line of dataLines) {
      if (!line.trim()) {
        validLines.push(line); // Keep empty lines
        continue;
      }
      
      const fields = line.split(',');
      
      // Check if we have enough fields (expiry is at index 7)
      if (fields.length < 8) {
        validLines.push(line); // Keep lines with insufficient fields
        continue;
      }
      
      const expiry = fields[7]?.replace(/"/g, ''); // Remove quotes and get expiry date
      const isExpired = isOptionExpired(expiry);
      
      processedCount++;
      
      if (isExpired) {
        removedCount++;
        console.log(`  Removing expired trade: ${fields[7] || 'Unknown'} ${expiry}`);
      } else {
        validLines.push(line);
      }
    }
    
    // Write the cleaned data back to the file
    const cleanedContent = validLines.join('\n');
    fs.writeFileSync(filePath, cleanedContent, 'utf8');
    
    console.log(`  Processed: ${processedCount}, Removed: ${removedCount}, Kept: ${processedCount - removedCount}`);
    
    return {
      processed: processedCount,
      removed: removedCount,
      total: processedCount
    };
    
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error);
    return { processed: 0, removed: 0, total: 0 };
  }
}

/**
 * Main function to process all CSV files in the data directory
 */
function main() {
  const dataDir = path.join(__dirname, '..', 'data');
  
  if (!fs.existsSync(dataDir)) {
    console.error('Data directory not found:', dataDir);
    process.exit(1);
  }
  
  console.log('Starting expired trade removal process...');
  console.log('Current date:', new Date().toLocaleDateString());
  console.log('');
  
  const files = fs.readdirSync(dataDir)
    .filter(file => file.endsWith('.csv'))
    .map(file => path.join(dataDir, file));
  
  if (files.length === 0) {
    console.log('No CSV files found in data directory');
    return;
  }
  
  console.log(`Found ${files.length} CSV files to process`);
  console.log('');
  
  let totalProcessed = 0;
  let totalRemoved = 0;
  let totalFiles = 0;
  
  for (const filePath of files) {
    const result = processCSVFile(filePath);
    totalProcessed += result.processed;
    totalRemoved += result.removed;
    totalFiles++;
  }
  
  console.log('');
  console.log('=== SUMMARY ===');
  console.log(`Files processed: ${totalFiles}`);
  console.log(`Total trades processed: ${totalProcessed}`);
  console.log(`Total expired trades removed: ${totalRemoved}`);
  console.log(`Total trades kept: ${totalProcessed - totalRemoved}`);
  
  if (totalRemoved > 0) {
    console.log('');
    console.log('✅ Successfully removed expired trades from CSV files');
    console.log('💡 You may want to run the data files update script to refresh the API');
  } else {
    console.log('');
    console.log('ℹ️  No expired trades found in any CSV files');
  }
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { isOptionExpired, processCSVFile };
