/**
 * Script to combine all options data CSV files into a single file
 * Removes duplicates using the same logic as the app
 * 
 * Usage: node scripts/combineDataFiles.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '..', 'data');
const OUTPUT_FILE = path.join(DATA_DIR, 'options_data_combined.csv');
const METADATA_FILE = path.join(DATA_DIR, 'options_data_combined.metadata.json');

/**
 * Parse CSV line handling quoted fields
 */
function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  
  fields.push(current);
  return fields;
}

/**
 * Parse timestamp from filename (same as fileLoader.ts)
 */
function parseTimestampFromFilename(filename) {
  try {
    const match = filename.match(/(?:options_data|option_data|darkpool_data)_(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2})\.csv/);
    if (!match) return null;
    
    const [, dateStr, timeStr] = match;
    const [year, month, day] = dateStr.split('-').map(Number);
    const [hour, minute] = timeStr.split('-').map(Number);
    
    return new Date(year, month - 1, day, hour, minute);
  } catch (error) {
    return null;
  }
}

/**
 * Check if an option has expired
 */
function isOptionExpired(expiryStr) {
  try {
    if (!expiryStr) return false;
    
    const parts = expiryStr.split('/');
    if (parts.length !== 3) return false;
    
    const month = parseInt(parts[0]) - 1;
    const day = parseInt(parts[1]);
    const year = parseInt(parts[2]);
    
    const expiryDate = new Date(year, month, day, 23, 59, 59);
    const today = new Date();
    
    return expiryDate < today;
  } catch (error) {
    return false;
  }
}

/**
 * Parse a single CSV file and extract valid option data
 */
function parseCSVFile(filePath, filename) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const data = [];
  
  // Skip header row
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    try {
      const fields = parseCSVLine(line);
      
      if (fields.length < 16) continue;
      
      // Check if this is a line with alternative format (empty first fields, "[" in field 4)
      const isAlternativeFormat = fields[4] === '[' || (fields[0] === '' && fields[1] === '' && fields[2] === '' && fields[3] === '');
      
      let timestamp, sweepType, ticker, strike, expiry, optionType, volume, premium, openInterest;
      
      if (isAlternativeFormat) {
        // Alternative format when first fields are empty and field[4] is "["
        // Fields: [4]="[", [5]=timestamp, [6]=sweepType, [7]=ticker, [8]=strike, [9]=expiry, [10]=optionType, [11]=bidAskType, [12]=volume, [13]=premium, [14]=openInterest
        timestamp = fields[5] || '';
        sweepType = fields[6] || '';
        ticker = fields[7] || '';
        strike = parseFloat(fields[8]) || 0;
        expiry = fields[9] || '';
        optionType = fields[10];
        volume = parseInt(fields[12]?.replace(/,/g, '') || '0');
        premium = fields[13] || '$0';
        openInterest = parseInt(fields[14]?.replace(/,/g, '') || '0');
      } else {
        // Standard format: [0]=avatar, [1]=username, [2]=botText, [3]=timestamp, [4]=separator, [5]=fullTimestamp, [6]=sweepType, [7]=ticker, [8]=strike, [9]=expiry, [10]=optionType, [11]=bidAskType, [12]=volume, [13]=premium, [14]=openInterest
        timestamp = fields[5] || fields[3] || '';
        sweepType = fields[6] || '';
        ticker = fields[7] || '';
        strike = parseFloat(fields[8]) || 0;
        expiry = fields[9] || '';
        optionType = fields[10];
        volume = parseInt(fields[12]?.replace(/,/g, '') || '0');
        premium = fields[13] || '$0';
        openInterest = parseInt(fields[14]?.replace(/,/g, '') || '0');
      }
      
      // Filter out invalid tickers
      const invalidTickers = ['Ask', 'Above', 'Bid', 'Below', 'Sweep', 'Block', 'Trade', 'Volume', 'Premium'];
      const isValidTicker = ticker && 
        ticker.length >= 1 && 
        ticker.length <= 10 && 
        !invalidTickers.includes(ticker) &&
        !ticker.match(/^\d+$/) &&
        !ticker.includes(' ') &&
        /^[A-Z0-9]+$/.test(ticker);
      
      const isExpired = isOptionExpired(expiry);
      
      if (isValidTicker && strike > 0 && expiry && optionType && volume > 0 && !isExpired) {
        data.push({
          ticker,
          strike,
          expiry,
          optionType,
          volume,
          premium,
          openInterest,
          timestamp,
          sweepType,
          sourceFile: filename,
          rawLine: line // Keep original line for output
        });
      }
    } catch (error) {
      // Skip invalid lines
      continue;
    }
  }
  
  return data;
}

/**
 * Combine all CSV files and remove duplicates
 */
function combineAllFiles() {
  console.log('📂 Scanning data directory...');
  
  const files = fs.readdirSync(DATA_DIR)
    .filter(f => f.startsWith('options_data_') && f.endsWith('.csv') && f !== 'options_data_combined.csv')
    .sort();
  
  console.log(`📄 Found ${files.length} data files to combine`);
  
  if (files.length === 0) {
    console.error('❌ No data files found!');
    process.exit(1);
  }
  
  // Track unique trades using the same key as the app
  const uniqueTrades = new Map();
  const fileStats = [];
  let totalRecords = 0;
  let totalExpired = 0;
  
  // Get today's date for expiry filtering
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Process each file
  for (const filename of files) {
    const filePath = path.join(DATA_DIR, filename);
    console.log(`  Processing: ${filename}...`);
    
    const fileData = parseCSVFile(filePath, filename);
    totalRecords += fileData.length;
    
    // Filter out expired options and deduplicate
    let duplicates = 0;
    let expired = 0;
    
    for (const trade of fileData) {
      // Double-check expiry (in case date changed since file was created)
      const isExpired = isOptionExpired(trade.expiry);
      
      if (isExpired) {
        expired++;
        continue; // Skip expired options
      }
      
      // Deduplicate using same logic as app
      const key = `${trade.ticker}_${trade.strike}_${trade.expiry}_${trade.optionType}_${trade.volume}_${trade.premium}_${trade.timestamp}`;
      
      if (!uniqueTrades.has(key)) {
        uniqueTrades.set(key, trade);
      } else {
        duplicates++;
      }
    }
    
    totalExpired += expired;
    
    fileStats.push({
      filename,
      records: fileData.length,
      duplicates,
      expired,
      unique: fileData.length - duplicates - expired
    });
    
    const expiredMsg = expired > 0 ? `, ${expired} expired` : '';
    console.log(`    ✓ ${fileData.length} records (${fileData.length - duplicates - expired} unique, ${duplicates} duplicates${expiredMsg})`);
  }
  
  // Get file timestamps for metadata
  const fileTimestamps = files.map(filename => {
    const filePath = path.join(DATA_DIR, filename);
    const stats = fs.statSync(filePath);
    const parsedTimestamp = parseTimestampFromFilename(filename);
    return {
      filename,
      modifiedTime: stats.mtime.toISOString(),
      parsedTimestamp: parsedTimestamp ? parsedTimestamp.toISOString() : null,
      size: stats.size
    };
  });
  
  // Find latest source file timestamp
  const latestSourceFile = fileTimestamps
    .sort((a, b) => new Date(b.modifiedTime) - new Date(a.modifiedTime))[0];
  
  // Write combined file with clean header (only fields we need)
  console.log('\n📝 Writing combined file with clean format...');
  
  // Create clean CSV header with only the fields we actually use
  const cleanHeader = 'ticker,strike,expiry,optionType,volume,premium,openInterest,bidAskSpread,timestamp,sweepType,sourceFile';
  
  // Write header and unique records (in clean format)
  const outputLines = [cleanHeader];
  for (const trade of uniqueTrades.values()) {
    // Create clean CSV row with only needed fields
    // Escape fields that contain commas or quotes
    const escapeField = (field) => {
      if (field === null || field === undefined) return '';
      const str = String(field);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };
    
    const row = [
      escapeField(trade.ticker),
      trade.strike,
      escapeField(trade.expiry),
      escapeField(trade.optionType),
      trade.volume,
      escapeField(trade.premium),
      trade.openInterest,
      0, // bidAskSpread (not available in source data)
      escapeField(trade.timestamp),
      escapeField(trade.sweepType),
      escapeField(trade.sourceFile || '')
    ].join(',');
    
    outputLines.push(row);
  }
  
  fs.writeFileSync(OUTPUT_FILE, outputLines.join('\n'), 'utf-8');
  
  // Generate metadata
  const metadata = {
    generatedAt: new Date().toISOString(),
    generatedBy: 'combineDataFiles.js',
    sourceFiles: {
      count: files.length,
      latest: latestSourceFile.filename,
      latestModified: latestSourceFile.modifiedTime,
      files: fileTimestamps.map(f => ({
        filename: f.filename,
        modifiedTime: f.modifiedTime,
        parsedTimestamp: f.parsedTimestamp,
        size: f.size
      }))
    },
    combinedFile: {
      filename: 'options_data_combined.csv',
      size: fs.statSync(OUTPUT_FILE).size,
      records: {
        totalBeforeFiltering: totalRecords,
        expiredRemoved: totalExpired,
        uniqueAfterDedup: uniqueTrades.size,
        duplicatesRemoved: totalRecords - totalExpired - uniqueTrades.size
      },
      fileStats: fileStats
    },
    version: '1.0'
  };
  
  // Write metadata file
  fs.writeFileSync(METADATA_FILE, JSON.stringify(metadata, null, 2), 'utf-8');
  
  // Print summary
  console.log('\n✅ Combine complete!');
  console.log(`📊 Summary:`);
  console.log(`   Total files processed: ${files.length}`);
  console.log(`   Total records before filtering: ${totalRecords.toLocaleString()}`);
  console.log(`   Expired options removed: ${totalExpired.toLocaleString()}`);
  console.log(`   Unique records after dedup: ${uniqueTrades.size.toLocaleString()}`);
  console.log(`   Duplicates removed: ${(totalRecords - totalExpired - uniqueTrades.size).toLocaleString()}`);
  console.log(`   Output file: ${OUTPUT_FILE}`);
  console.log(`   File size: ${(fs.statSync(OUTPUT_FILE).size / 1024).toFixed(2)} KB`);
  console.log(`   Latest source file: ${latestSourceFile.filename} (${new Date(latestSourceFile.modifiedTime).toLocaleString()})`);
  console.log(`   Metadata saved: ${METADATA_FILE}`);
  
  // Show per-file stats
  console.log('\n📋 Per-file statistics:');
  fileStats.forEach(stat => {
    const parts = [`${stat.records} records`, `${stat.unique} unique`];
    if (stat.duplicates > 0) parts.push(`${stat.duplicates} dup`);
    if (stat.expired > 0) parts.push(`${stat.expired} expired`);
    console.log(`   ${stat.filename}: ${parts.join(', ')}`);
  });
}

// Run the combine process
try {
  combineAllFiles();
  console.log('\n🎉 Done! You can now update the app to load options_data_combined.csv');
} catch (error) {
  console.error('❌ Error combining files:', error);
  process.exit(1);
}

