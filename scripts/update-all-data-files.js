#!/usr/bin/env node

/**
 * Script to update both options and dark pool data files
 * This script runs both update scripts in sequence
 */

import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Run a command and handle errors
 */
function runCommand(command, description) {
  try {
    console.log(`\n🔄 ${description}...`);
    execSync(command, { 
      stdio: 'inherit',
      cwd: path.join(__dirname, '..')
    });
    console.log(`✅ ${description} completed successfully`);
  } catch (error) {
    console.error(`❌ Error during ${description}:`, error.message);
    throw error;
  }
}

/**
 * Main execution
 */
function updateAllDataFiles() {
  console.log('🚀 Starting update of all data files...\n');
  
  try {
    // Update options data files
    runCommand('npm run update-data', 'Updating options data files');
    
    // Update dark pool data files
    runCommand('npm run update-darkpool-data', 'Updating dark pool data files');
    
    console.log('\n🎉 All data files updated successfully!');
    console.log('\n📊 Summary:');
    console.log('   - Options data files: Updated');
    console.log('   - Dark pool data files: Updated');
    
  } catch (error) {
    console.error('\n💥 Failed to update all data files:', error.message);
    process.exit(1);
  }
}

// Check for watch mode
const args = process.argv.slice(2);

if (args.includes('--watch')) {
  console.log('👀 Watch mode not supported for combined script');
  console.log('   Use separate watch commands:');
  console.log('   - npm run watch-data (for options)');
  console.log('   - npm run watch-darkpool-data (for dark pool)');
  process.exit(0);
}

updateAllDataFiles();
