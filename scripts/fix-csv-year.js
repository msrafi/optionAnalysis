#!/usr/bin/env node

/**
 * Fix CSV year - Replace 2025 with 2024 in timestamp fields
 * Usage: node scripts/fix-csv-year.js <csv-file>
 */

const fs = require('fs');
const path = require('path');

// Get file path from command line
const filePath = process.argv[2];

if (!filePath) {
  console.error('Usage: node scripts/fix-csv-year.js <csv-file>');
  process.exit(1);
}

const fullPath = path.resolve(filePath);

if (!fs.existsSync(fullPath)) {
  console.error(`File not found: ${fullPath}`);
  process.exit(1);
}

console.log(`Reading file: ${fullPath}`);

// Read the file
let content = fs.readFileSync(fullPath, 'utf8');

// Count replacements
const before = content.match(/2025/g)?.length || 0;

// Replace all instances of 2025 with 2024 in timestamp fields
content = content.replace(/2025/g, '2024');

const after = content.match(/2024/g)?.length || 0;

// Create backup
const backupPath = fullPath.replace('.csv', '.backup.csv');
fs.writeFileSync(backupPath, fs.readFileSync(fullPath));
console.log(`✓ Backup created: ${backupPath}`);

// Write fixed content
fs.writeFileSync(fullPath, content);

console.log(`✓ Fixed ${before} occurrences of "2025" → "2024"`);
console.log(`✓ File updated: ${fullPath}`);
console.log('\nDone! Refresh your dashboard to see the updated data.');

