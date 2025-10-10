# Data Management Guide

## How to Add New CSV Files

The Option Analysis Dashboard automatically detects and loads new CSV files from the `data/` folder. Here's how to add new data:

### 1. **File Naming Convention**

All CSV files must follow this naming pattern:
```
options_data_YYYY-MM-DD_HH-MM.csv
```

**Examples:**
- `options_data_2024-01-15_10-00.csv` (January 15, 2024 at 10:00 AM)
- `options_data_2024-01-15_11-00.csv` (January 15, 2024 at 11:00 AM)
- `options_data_2024-01-15_14-30.csv` (January 15, 2024 at 2:30 PM)

### 2. **Adding New Files**

#### **Method 1: Manual Addition**
1. Place your CSV file in the `data/` folder with the correct naming convention
2. Run the update script:
   ```bash
   npm run update-data
   ```
3. Refresh your browser to see the new data

#### **Method 2: Automatic Detection (Recommended)**
1. Start the file watcher:
   ```bash
   npm run watch-data
   ```
2. Add your CSV file to the `data/` folder
3. The app will automatically detect and load the new file
4. Refresh your browser to see the new data

### 3. **CSV File Structure**

Your CSV files should contain the following columns (in any order):
- **Ticker**: Stock symbol (e.g., MSTR, NVDA, FE)
- **Strike**: Strike price
- **Expiry**: Expiration date
- **Option Type**: Call or Put
- **Volume**: Trading volume
- **Premium**: Option premium
- **Open Interest**: Open interest
- **Bid/Ask Spread**: Spread information
- **Timestamp**: Trade timestamp
- **Sweep Type**: Trade type (Ask, Bid, Above, Below)

### 4. **Data Merging**

The dashboard automatically:
- ✅ **Merges data** from all CSV files
- ✅ **Sorts by timestamp** (most recent first)
- ✅ **Filters duplicates** based on ticker, strike, expiry, and timestamp
- ✅ **Shows data summary** with file count and record count
- ✅ **Updates in real-time** when new files are added

### 5. **Troubleshooting**

#### **File Not Appearing?**
1. Check the filename follows the exact convention
2. Ensure the file is in the `data/` folder
3. Run `npm run update-data` to refresh the file list
4. Check the browser console for any errors

#### **Data Not Loading?**
1. Verify CSV format matches expected structure
2. Check for invalid timestamps or data
3. Look at browser console for parsing errors
4. Ensure file is not corrupted

### 6. **Scripts Available**

- `npm run update-data` - Update the data files list once
- `npm run watch-data` - Watch for new files and auto-update
- `npm run dev` - Start the development server

### 7. **File Organization**

```
optionAnalysis/
├── data/                          # CSV data files
│   ├── options_data_2024-01-15_10-00.csv
│   ├── options_data_2024-01-15_11-00.csv
│   └── ...
├── scripts/
│   ├── update-data-files.js       # Auto-update script
│   └── add-data-file.js          # Helper script
├── public/
│   └── api/
│       └── data-files            # Generated file list
└── ...
```

### 8. **Best Practices**

1. **Regular Updates**: Add new data files hourly or as needed
2. **Consistent Naming**: Always use the exact naming convention
3. **Data Quality**: Ensure CSV files are properly formatted
4. **Backup**: Keep backups of your data files
5. **Monitoring**: Use the watch script for automatic detection

### 9. **Performance Tips**

- The app caches loaded data for better performance
- Large files (>10MB) may take longer to load
- Consider splitting very large datasets into multiple files
- Use the data summary to monitor total records

---

**Need Help?** Check the browser console for detailed error messages or refer to the main README.md file.
