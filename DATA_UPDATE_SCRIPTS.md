# Data Update Scripts

This document describes the various npm scripts available for updating data files in the application.

## Available Scripts

### Options Data Scripts

#### `npm run update-data`
Updates the options data files list by scanning the `data/` directory for files matching the pattern `options_data_YYYY-MM-DD_HH-MM.csv`.

**What it does:**
- Scans the `data/` directory for options CSV files
- Parses timestamps from filenames
- Updates `public/api/data-files.json` with the current file list
- Displays a summary of found files

#### `npm run watch-data`
Same as `update-data` but runs in watch mode, automatically updating the file list when new options CSV files are added to the `data/` directory.

### Dark Pool Data Scripts

#### `npm run update-darkpool-data`
Updates the dark pool data files list by scanning the `data/` directory for files matching the pattern `darkpool_data_YYYY-MM-DD_HH-MM.csv`.

**What it does:**
- Scans the `data/` directory for dark pool CSV files
- Parses timestamps from filenames
- Updates `public/api/darkpool-data-files.json` with the current file list
- Displays a summary of found files

#### `npm run watch-darkpool-data`
Same as `update-darkpool-data` but runs in watch mode, automatically updating the file list when new dark pool CSV files are added to the `data/` directory.

### Combined Scripts

#### `npm run update-all-data`
Updates both options and dark pool data files in sequence.

**What it does:**
- Runs `npm run update-data` to update options data files
- Runs `npm run update-darkpool-data` to update dark pool data files
- Provides a comprehensive summary of both operations

## File Naming Conventions

### Options Data Files
- Pattern: `options_data_YYYY-MM-DD_HH-MM.csv`
- Example: `options_data_2025-10-17_15-00.csv`
- Location: `data/` directory

### Dark Pool Data Files
- Pattern: `darkpool_data_YYYY-MM-DD_HH-MM.csv`
- Example: `darkpool_data_2025-10-17_15-00.csv`
- Location: `data/` directory

## Generated API Files

### Options Data API
- File: `public/api/data-files.json`
- Contains: List of all options CSV files with metadata
- Used by: Options dashboard for file discovery

### Dark Pool Data API
- File: `public/api/darkpool-data-files.json`
- Contains: List of all dark pool CSV files with metadata
- Used by: Dark pool dashboard for file discovery

## Usage Examples

### Update All Data Files
```bash
npm run update-all-data
```

### Update Only Options Data
```bash
npm run update-data
```

### Update Only Dark Pool Data
```bash
npm run update-darkpool-data
```

### Watch for New Options Files
```bash
npm run watch-data
```

### Watch for New Dark Pool Files
```bash
npm run watch-darkpool-data
```

## File Metadata

Each file entry in the generated JSON files contains:
- `name`: The filename
- `size`: File size in bytes
- `timestamp`: Parsed timestamp from filename (ISO format)

## Error Handling

- Scripts will create the `data/` directory if it doesn't exist
- Invalid filenames are logged as warnings but don't stop execution
- File size errors are logged as warnings
- Scripts continue processing even if individual files fail

## Integration with Application

The generated API files are automatically used by the application's file loading system:
- Options dashboard reads from `public/api/data-files.json`
- Dark pool dashboard reads from `public/api/darkpool-data-files.json`
- Files are loaded dynamically based on the API file contents
- Caching is handled separately for each data type

## Development Workflow

1. Add new CSV files to the `data/` directory
2. Run the appropriate update script:
   - `npm run update-data` for options files
   - `npm run update-darkpool-data` for dark pool files
   - `npm run update-all-data` for both
3. The application will automatically detect and load the new files
4. Use watch mode during development for automatic updates
