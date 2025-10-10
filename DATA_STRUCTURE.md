# Data Structure and File Management

## Overview

The Option Analysis Dashboard now supports loading data from multiple CSV files organized in a structured manner. This allows for hourly data updates and comprehensive analysis across time periods.

## Data Directory Structure

```
optionAnalysis/
├── data/                           # Main data directory
│   ├── options_data_2024-01-15_10-00.csv
│   ├── options_data_2024-01-15_11-00.csv
│   ├── options_data_2024-01-15_12-00.csv
│   └── ...                        # Additional hourly files
├── public/
│   └── api/
│       └── data-files             # API endpoint for file listing
└── src/
    └── utils/
        ├── fileLoader.ts          # File loading utilities
        └── dataParser.ts          # Data parsing and merging
```

## File Naming Convention

All data files must follow this naming pattern:
```
options_data_YYYY-MM-DD_HH-MM.csv
```

**Examples:**
- `options_data_2024-01-15_10-00.csv` - January 15, 2024 at 10:00 AM
- `options_data_2024-01-15_14-30.csv` - January 15, 2024 at 2:30 PM
- `options_data_2024-01-16_09-15.csv` - January 16, 2024 at 9:15 AM

## Adding New Data Files

### Method 1: Manual File Addition
1. Place your CSV file in the `data/` directory
2. Name it according to the convention above
3. Update the `public/api/data-files` endpoint to include the new file
4. Refresh the dashboard

### Method 2: Automated Hourly Updates
For production environments, you can:
1. Set up a cron job or scheduled task to generate new CSV files hourly
2. Use the `generateDataFilename()` function to create properly named files
3. Automatically update the API endpoint

## Data Merging and Analysis

The dashboard automatically:
- **Loads all CSV files** from the data directory
- **Merges data** from multiple files chronologically
- **Tracks source files** for each data record
- **Provides data summary** showing total files, records, and date ranges
- **Sorts tickers** by most recent activity across all files

## Key Features

### Multi-File Support
- Loads data from multiple CSV files simultaneously
- Merges data chronologically (most recent first)
- Tracks which file each record came from

### Data Summary Dashboard
- Shows total number of files loaded
- Displays total records across all files
- Shows latest data timestamp
- Provides file-by-file breakdown

### Time-Based Analysis
- Data is sorted by most recent activity
- Supports filtering by time ranges
- Tracks data freshness across files

### Error Handling
- Graceful handling of missing or corrupted files
- Detailed error messages for troubleshooting
- Retry functionality for failed loads

## API Endpoints

### GET /api/data-files
Returns a JSON array of available data files:
```json
[
  {
    "name": "options_data_2024-01-15_10-00.csv",
    "size": 1024000,
    "timestamp": "2024-01-15T10:00:00Z"
  }
]
```

## Utility Functions

### File Loading (`fileLoader.ts`)
- `loadAllDataFiles()` - Loads all CSV files from data directory
- `parseTimestampFromFilename()` - Extracts timestamp from filename
- `generateDataFilename()` - Creates properly formatted filename
- `getRecentFiles()` - Filters files by time range

### Data Parsing (`dataParser.ts`)
- `mergeDataFromFiles()` - Merges data from multiple files
- `getDataSummary()` - Provides comprehensive data statistics
- `filterDataByTimeRange()` - Filters data by date range
- `getRecentData()` - Gets data from last N hours

## Best Practices

1. **Consistent Naming**: Always use the exact naming convention
2. **Regular Updates**: Add new files hourly for best analysis
3. **Data Quality**: Ensure CSV files have consistent structure
4. **File Management**: Archive old files to prevent directory bloat
5. **Backup**: Keep backups of important data files

## Troubleshooting

### Common Issues
- **File not loading**: Check filename format and location
- **Data not appearing**: Verify CSV structure matches expected format
- **Performance issues**: Consider archiving old files
- **API errors**: Check `public/api/data-files` endpoint

### Debug Information
The dashboard console logs provide detailed information about:
- Number of files loaded
- Total records processed
- Any errors encountered
- Data merging statistics

## Future Enhancements

- Real-time file monitoring
- Automatic data validation
- Data compression for large files
- Historical data archiving
- API authentication for production use
