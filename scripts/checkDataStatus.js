/**
 * Script to check if the combined data file is up to date
 * Compares source files with the combined file metadata
 * 
 * Usage: node scripts/checkDataStatus.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '..', 'data');
const METADATA_FILE = path.join(DATA_DIR, 'options_data_combined.metadata.json');
const COMBINED_FILE = path.join(DATA_DIR, 'options_data_combined.csv');

/**
 * Parse timestamp from filename
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
 * Check if combined file is up to date
 */
function checkDataStatus() {
  console.log('🔍 Checking data file status...\n');
  
  // Check if combined file exists
  if (!fs.existsSync(COMBINED_FILE)) {
    console.log('❌ Combined file not found!');
    console.log('   Run: node scripts/combineDataFiles.js');
    return { needsUpdate: true, reason: 'Combined file missing' };
  }
  
  // Check if metadata exists
  if (!fs.existsSync(METADATA_FILE)) {
    console.log('⚠️  Metadata file not found!');
    console.log('   Combined file exists but metadata is missing.');
    console.log('   Run: node scripts/combineDataFiles.js to regenerate');
    return { needsUpdate: true, reason: 'Metadata missing' };
  }
  
  // Load metadata
  let metadata;
  try {
    metadata = JSON.parse(fs.readFileSync(METADATA_FILE, 'utf-8'));
  } catch (error) {
    console.error('❌ Failed to read metadata:', error.message);
    return { needsUpdate: true, reason: 'Metadata corrupted' };
  }
  
  // Get current source files
  const currentFiles = fs.readdirSync(DATA_DIR)
    .filter(f => f.startsWith('options_data_') && f.endsWith('.csv') && f !== 'options_data_combined.csv')
    .sort();
  
  // Get metadata source files
  const metadataFiles = new Set(metadata.sourceFiles.files.map(f => f.filename));
  const currentFilesSet = new Set(currentFiles);
  
  // Check for new files
  const newFiles = currentFiles.filter(f => !metadataFiles.has(f));
  
  // Check for missing files (files in metadata but not in directory)
  const missingFiles = Array.from(metadataFiles).filter(f => !currentFilesSet.has(f));
  
  // Check for modified files
  const modifiedFiles = [];
  for (const currentFile of currentFiles) {
    if (metadataFiles.has(currentFile)) {
      const currentPath = path.join(DATA_DIR, currentFile);
      const currentStats = fs.statSync(currentPath);
      const currentMtime = new Date(currentStats.mtime).toISOString();
      
      const metadataFile = metadata.sourceFiles.files.find(f => f.filename === currentFile);
      if (metadataFile && metadataFile.modifiedTime !== currentMtime) {
        modifiedFiles.push({
          filename: currentFile,
          oldTime: metadataFile.modifiedTime,
          newTime: currentMtime
        });
      }
    }
  }
  
  // Determine if update is needed
  const needsUpdate = newFiles.length > 0 || modifiedFiles.length > 0;
  
  // Print status
  console.log('📊 Current Status:');
  console.log(`   Combined file: ${COMBINED_FILE}`);
  console.log(`   Generated: ${new Date(metadata.generatedAt).toLocaleString()}`);
  console.log(`   Records: ${metadata.combinedFile.records.uniqueAfterDedup.toLocaleString()}`);
  console.log(`   Source files in metadata: ${metadata.sourceFiles.count}`);
  console.log(`   Source files in directory: ${currentFiles.length}`);
  console.log(`   Latest source file: ${metadata.sourceFiles.latest}`);
  console.log(`   Latest source modified: ${new Date(metadata.sourceFiles.latestModified).toLocaleString()}`);
  
  if (newFiles.length > 0) {
    console.log(`\n🆕 New files detected (${newFiles.length}):`);
    newFiles.forEach(f => {
      const stats = fs.statSync(path.join(DATA_DIR, f));
      console.log(`   + ${f} (${new Date(stats.mtime).toLocaleString()})`);
    });
  }
  
  if (modifiedFiles.length > 0) {
    console.log(`\n📝 Modified files detected (${modifiedFiles.length}):`);
    modifiedFiles.forEach(f => {
      console.log(`   ~ ${f.filename}`);
      console.log(`     Old: ${new Date(f.oldTime).toLocaleString()}`);
      console.log(`     New: ${new Date(f.newTime).toLocaleString()}`);
    });
  }
  
  if (missingFiles.length > 0) {
    console.log(`\n🗑️  Files removed from directory (${missingFiles.length}):`);
    missingFiles.forEach(f => console.log(`   - ${f}`));
  }
  
  if (needsUpdate) {
    console.log('\n⚠️  Combined file is OUT OF DATE!');
    console.log('   Run: node scripts/combineDataFiles.js');
    return { needsUpdate: true, reason: 'New or modified source files detected', newFiles, modifiedFiles };
  } else {
    console.log('\n✅ Combined file is UP TO DATE!');
    return { needsUpdate: false };
  }
}

// Run the check
try {
  const result = checkDataStatus();
  process.exit(result.needsUpdate ? 1 : 0);
} catch (error) {
  console.error('❌ Error checking status:', error);
  process.exit(1);
}

