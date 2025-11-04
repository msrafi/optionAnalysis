# Combined Data File Guide

## Overview

The app now uses a single combined data file (`options_data_combined.csv`) instead of loading multiple CSV files individually. This provides:

- **Faster loading** - One HTTP request instead of 42+
- **Simpler code** - No complex merge logic needed
- **Better caching** - Browser can cache one file efficiently
- **Automatic deduplication** - Duplicates removed during combination

## How to Know if Latest Data is Added

### Method 1: Check Status Script (Recommended)

Run this command to check if the combined file is up to date:

```bash
npm run check-data-status
```

Or directly:
```bash
node scripts/checkDataStatus.js
```

**Output when up to date:**
```
✅ Combined file is UP TO DATE!
```

**Output when update needed:**
```
⚠️  Combined file is OUT OF DATE!
   Run: node scripts/combineDataFiles.js
```

The script checks for:
- New CSV files added to the `data/` directory
- Modified CSV files (changed timestamps)
- Missing files (removed from directory)

### Method 2: Check in the App

The dashboard header now shows when the combined file was last generated:

- Look for "Updated: [date/time]" in the header stats
- Hover over it to see the latest source file name
- If you see old dates, run the combine script

### Method 3: Check Metadata File

The metadata file (`data/options_data_combined.metadata.json`) contains:

```json
{
  "generatedAt": "2025-11-03T20:51:57.123Z",
  "sourceFiles": {
    "count": 41,
    "latest": "options_data_2025-11-03_16-00.csv",
    "latestModified": "2025-11-03T20:36:30.123Z"
  }
}
```

Compare `latestModified` with your source files to see if updates are needed.

## When to Regenerate the Combined File

You need to regenerate the combined file when:

1. **New CSV files are added** to the `data/` directory
2. **Existing CSV files are modified** (updated timestamps)
3. **You want fresh data** after making changes

## How to Regenerate

### Option 1: Manual Regeneration

```bash
npm run combine-data
```

Or directly:
```bash
node scripts/combineDataFiles.js
```

### Option 2: Automatic Regeneration (Recommended)

Add the combine script to your workflow:

1. **After adding new data files:**
   ```bash
   # Add your CSV files to data/
   npm run combine-data
   npm run build  # or npm run dev
   ```

2. **Before building for production:**
   The `prebuild` hook already runs `update-all-data`, but you may want to add:
   ```json
   "prebuild": "npm run combine-data && npm run update-all-data"
   ```

## What the Combine Script Does

1. **Scans** all `options_data_*.csv` files in `data/` directory
2. **Parses** each file and extracts valid option data
3. **Removes duplicates** using the same logic as the app
4. **Combines** all unique records into one file
5. **Generates metadata** with:
   - Generation timestamp
   - Source file list and timestamps
   - Record counts
   - Latest source file info

## Files Created

- `data/options_data_combined.csv` - The combined data file
- `data/options_data_combined.metadata.json` - Metadata about the combination

## Workflow Example

```bash
# 1. Check current status
npm run check-data-status

# 2. Add new CSV files to data/ directory
# (copy your new files here)

# 3. Regenerate combined file
npm run combine-data

# 4. Verify it worked
npm run check-data-status

# 5. Test in app
npm run dev
```

## Troubleshooting

### "Combined file not found"
- Run `npm run combine-data` to create it

### "Metadata file not found"
- Run `npm run combine-data` to regenerate with metadata

### "Out of date" warning
- New or modified files detected
- Run `npm run combine-data` to update

### App shows old data
- Hard refresh the browser (Cmd+Shift+R / Ctrl+Shift+R)
- Or use the "Hard Refresh" button in the app

## Quick Reference

| Command | Purpose |
|---------|---------|
| `npm run combine-data` | Regenerate combined file |
| `npm run check-data-status` | Check if update needed |
| `npm run build` | Build (includes prebuild hooks) |

