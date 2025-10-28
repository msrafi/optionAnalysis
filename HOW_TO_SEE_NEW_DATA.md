# How to See New Data - Service Worker Cache Issue

## Quick Fix (IMPORTANT - Do This Now!)

Your browser has cached the old service worker. To see the new data, you need to clear it:

### Option 1: Using Browser Console (Easiest)

1. **Open your browser's Developer Console** (F12 or Cmd+Option+I)
2. **Copy and paste this command** and press Enter:
   ```javascript
   clearAllCaches()
   ```
3. The page will automatically reload with fresh data

### Option 2: Manual Service Worker Unregister

1. **Open Chrome DevTools** (F12)
2. Go to **Application** tab
3. Click **Service Workers** on the left sidebar
4. Find "http://localhost:3000" (or your domain)
5. Click **Unregister** button
6. **Reload the page** (Cmd+Shift+R or Ctrl+Shift+R for hard reload)

### Option 3: Complete Browser Cache Clear

1. Close the application tab
2. In DevTools (F12), go to **Application** tab
3. Click **Clear storage** on the left
4. Check all boxes
5. Click **Clear site data**
6. Reopen the application in a new tab

## What I Fixed

✅ **Updated Service Worker Cache Version** (`option-analysis-v5`)
- Old cache: `option-analysis-v3`
- New cache: `option-analysis-v5`
- This forces the browser to recognize new data

✅ **Automatic Data Updates**
- Added prebuild hook to update data files automatically
- Scripts now update both `public/` and `dist/` directories
- Data files are synced before every build

✅ **Enhanced Cache Clearing**
- Click "Clear All Caches" button in the app
- Now clears service worker caches too
- Clears session storage, local storage, and browser cache

## How to Prevent This Issue

### For Development:
1. **Always run before viewing:**
   ```bash
   npm run update-all-data
   ```
2. **Or use watch mode:**
   ```bash
   npm run watch-data
   ```

### When Adding New Data Files:
1. Add CSV files to `data/` directory
2. Run `npm run update-all-data`
3. **Hard reload browser** (Cmd+Shift+R)
4. Or clear caches using the button in the app

### The Permanent Solution

The service worker now:
- Detects when new data is available
- Auto-updates on build
- Can be cleared with one click from the UI
- Has a new version number that forces refresh

## Verify New Data is Loading

After clearing the cache, check the console for:
```
✅ Service worker caches cleared
Loaded 35 data files from API
```

If you see the correct number of files, the new data should be displaying!

## Still Having Issues?

Run this in the browser console to check what's happening:
```javascript
fetch('/optionAnalysis/api/data-files.json')
  .then(r => r.json())
  .then(data => console.log('Latest data files:', data))
```

This will show you exactly what the app sees.

