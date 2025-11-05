/**
 * Script to combine all options data CSV files into a single file
 * Removes duplicates using the same logic as the app
 * Appends new data to existing combined file instead of regenerating everything
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
 * Load existing combined file and parse it into trade objects
 */
function loadExistingCombinedFile() {
  if (!fs.existsSync(OUTPUT_FILE)) {
    return { trades: new Map(), processedFiles: new Set() };
  }
  
  console.log('📂 Loading existing combined file...');
  const content = fs.readFileSync(OUTPUT_FILE, 'utf-8');
  const lines = content.split('\n');
  
  const trades = new Map();
  let lineCount = 0;
  
  // Skip header row
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    try {
      const fields = parseCSVLine(line);
      if (fields.length < 11) continue;
      
      const trade = {
        ticker: fields[0],
        strike: parseFloat(fields[1]) || 0,
        expiry: fields[2],
        optionType: fields[3],
        volume: parseInt(fields[4]?.replace(/,/g, '') || '0'),
        premium: fields[5],
        openInterest: parseInt(fields[6]?.replace(/,/g, '') || '0'),
        bidAskSpread: parseInt(fields[7] || '0'),
        timestamp: fields[8],
        sweepType: fields[9],
        sourceFile: fields[10] || ''
      };
      
      // Create deduplication key
      const key = `${trade.ticker}_${trade.strike}_${trade.expiry}_${trade.optionType}_${trade.volume}_${trade.premium}_${trade.timestamp}`;
      
      // Only keep if not expired
      if (!isOptionExpired(trade.expiry)) {
        trades.set(key, trade);
        lineCount++;
      }
    } catch (error) {
      // Skip invalid lines
      continue;
    }
  }
  
  console.log(`   Loaded ${trades.size} existing records from combined file`);
  
  // Load metadata to get list of already processed files
  let processedFiles = new Set();
  if (fs.existsSync(METADATA_FILE)) {
    try {
      const metadataContent = fs.readFileSync(METADATA_FILE, 'utf-8');
      const metadata = JSON.parse(metadataContent);
      
      if (metadata.sourceFiles && metadata.sourceFiles.files) {
        metadata.sourceFiles.files.forEach(file => {
          processedFiles.add(file.filename);
        });
        console.log(`   Found ${processedFiles.size} already processed files in metadata`);
      }
    } catch (error) {
      console.warn('   Warning: Could not load metadata, will process all files');
    }
  }
  
  return { trades, processedFiles };
}

/**
 * Combine all CSV files and remove duplicates
 * Appends new data to existing combined file
 */
function combineAllFiles() {
  console.log('📂 Scanning data directory...');
  
  // Load existing combined file
  const { trades: existingTrades, processedFiles } = loadExistingCombinedFile();
  
  // Find all data files
  const allFiles = fs.readdirSync(DATA_DIR)
    .filter(f => f.startsWith('options_data_') && f.endsWith('.csv') && f !== 'options_data_combined.csv')
    .sort();
  
  // Filter to only new files (not already processed)
  const newFiles = allFiles.filter(f => !processedFiles.has(f));
  
  console.log(`📄 Found ${allFiles.length} total data files`);
  console.log(`   ${processedFiles.size} already processed`);
  console.log(`   ${newFiles.length} new files to process`);
  
  if (newFiles.length === 0) {
    console.log('\n✅ No new files to process. Combined file is up to date.');
    return;
  }
  
  // Track unique trades - start with existing trades
  const uniqueTrades = new Map(existingTrades);
  const fileStats = [];
  let totalNewRecords = 0;
  let totalExpired = 0;
  let totalDuplicates = 0;
  
  // Process only new files
  for (const filename of newFiles) {
    const filePath = path.join(DATA_DIR, filename);
    console.log(`  Processing: ${filename}...`);
    
    const fileData = parseCSVFile(filePath, filename);
    totalNewRecords += fileData.length;
    
    // Filter out expired options and deduplicate
    let duplicates = 0;
    let expired = 0;
    let newUnique = 0;
    
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
        newUnique++;
      } else {
        duplicates++;
      }
    }
    
    totalExpired += expired;
    totalDuplicates += duplicates;
    
    fileStats.push({
      filename,
      records: fileData.length,
      duplicates,
      expired,
      unique: newUnique
    });
    
    const expiredMsg = expired > 0 ? `, ${expired} expired` : '';
    console.log(`    ✓ ${fileData.length} records (${newUnique} new unique, ${duplicates} duplicates${expiredMsg})`);
  }
  
  // Remove expired options from existing data
  console.log('\n🧹 Removing expired options from existing data...');
  let expiredRemovedFromExisting = 0;
  for (const [key, trade] of uniqueTrades.entries()) {
    if (isOptionExpired(trade.expiry)) {
      uniqueTrades.delete(key);
      expiredRemovedFromExisting++;
    }
  }
  if (expiredRemovedFromExisting > 0) {
    console.log(`   Removed ${expiredRemovedFromExisting} expired options from existing data`);
  }
  
  // Get file timestamps for new files only (for metadata)
  const newFileTimestamps = newFiles.map(filename => {
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
  const latestSourceFile = newFileTimestamps.length > 0
    ? newFileTimestamps.sort((a, b) => new Date(b.modifiedTime) - new Date(a.modifiedTime))[0]
    : null;
  
  // Load existing metadata to preserve old file info if needed, but we'll only track new files going forward
  let existingMetadata = null;
  if (fs.existsSync(METADATA_FILE)) {
    try {
      const metadataContent = fs.readFileSync(METADATA_FILE, 'utf-8');
      existingMetadata = JSON.parse(metadataContent);
    } catch (error) {
      // Ignore errors
    }
  }
  
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
      trade.bidAskSpread || 0,
      escapeField(trade.timestamp),
      escapeField(trade.sweepType),
      escapeField(trade.sourceFile || '')
    ].join(',');
    
    outputLines.push(row);
  }
  
  fs.writeFileSync(OUTPUT_FILE, outputLines.join('\n'), 'utf-8');
  
  // Generate metadata - accumulate processed files (but old files can still be deleted)
  // Get existing processed files from metadata
  const existingProcessedFiles = existingMetadata?.sourceFiles?.files || [];
  
  // Combine existing processed files with new ones
  const allProcessedFiles = [...existingProcessedFiles, ...newFileTimestamps];
  
  // Keep only the latest entry for each filename (in case of duplicates)
  const processedFilesMap = new Map();
  allProcessedFiles.forEach(file => {
    processedFilesMap.set(file.filename, file);
  });
  
  const metadata = {
    generatedAt: new Date().toISOString(),
    generatedBy: 'combineDataFiles.js',
    sourceFiles: {
      count: Array.from(processedFilesMap.values()).length,
      latest: latestSourceFile ? latestSourceFile.filename : (existingMetadata?.sourceFiles?.latest || ''),
      latestModified: latestSourceFile ? latestSourceFile.modifiedTime : (existingMetadata?.sourceFiles?.latestModified || ''),
      // Track all processed files (for deduplication), but old files can still be deleted
      files: Array.from(processedFilesMap.values())
    },
    combinedFile: {
      filename: 'options_data_combined.csv',
      size: fs.statSync(OUTPUT_FILE).size,
      records: {
        totalUnique: uniqueTrades.size,
        newRecordsAdded: totalNewRecords,
        expiredRemoved: totalExpired + expiredRemovedFromExisting,
        duplicatesRemoved: totalDuplicates,
        existingRecordsKept: existingTrades.size - expiredRemovedFromExisting
      },
      fileStats: fileStats
    },
    version: '2.0', // Version 2.0 for append mode
    note: 'Metadata tracks processed files for deduplication. Old individual files can be safely deleted after processing.'
  };
  
  // Write metadata file
  fs.writeFileSync(METADATA_FILE, JSON.stringify(metadata, null, 2), 'utf-8');
  
  // Print summary
  console.log('\n✅ Combine complete!');
  console.log(`📊 Summary:`);
  console.log(`   New files processed: ${newFiles.length}`);
  console.log(`   New records added: ${totalNewRecords.toLocaleString()}`);
  console.log(`   Expired options removed: ${(totalExpired + expiredRemovedFromExisting).toLocaleString()}`);
  console.log(`   Duplicates removed: ${totalDuplicates.toLocaleString()}`);
  console.log(`   Total unique records: ${uniqueTrades.size.toLocaleString()}`);
  console.log(`   Output file: ${OUTPUT_FILE}`);
  console.log(`   File size: ${(fs.statSync(OUTPUT_FILE).size / 1024).toFixed(2)} KB`);
  if (latestSourceFile) {
    console.log(`   Latest source file: ${latestSourceFile.filename} (${new Date(latestSourceFile.modifiedTime).toLocaleString()})`);
  }
  console.log(`   Metadata saved: ${METADATA_FILE}`);
  console.log(`\n💡 Note: Old individual data files can now be safely deleted. Only new files are tracked.`);
  
  // Show per-file stats
  if (fileStats.length > 0) {
    console.log('\n📋 Per-file statistics (new files only):');
    fileStats.forEach(stat => {
      const parts = [`${stat.records} records`, `${stat.unique} new unique`];
      if (stat.duplicates > 0) parts.push(`${stat.duplicates} dup`);
      if (stat.expired > 0) parts.push(`${stat.expired} expired`);
      console.log(`   ${stat.filename}: ${parts.join(', ')}`);
    });
  }
}

// Run the combine process
try {
  combineAllFiles();
  console.log('\n🎉 Done! You can now update the app to load options_data_combined.csv');
} catch (error) {
  console.error('❌ Error combining files:', error);
  process.exit(1);
}

