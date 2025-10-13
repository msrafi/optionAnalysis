# Option Analysis Dashboard

A modern React dashboard for options trading analysis and volume profile visualization with multi-file data support.

## Features

- **Real-Time Stock Prices**: Fetches current stock prices from NASDAQ/Finnhub API (with Yahoo Finance fallback)
- **Smart Price Caching**: 15-minute cache to minimize API calls while keeping prices fresh
- **Multi-File Data Support**: Loads and merges data from multiple CSV files
- **Hourly Data Updates**: Supports adding new data files every hour
- **Ticker List View**: Browse all available tickers sorted by recent activity
- **Dual Chart Layout**: Side-by-side call/put and total volume charts
- **Volume Profile Charts**: Interactive charts with vertical price orientation
- **Current Price Indicators**: Highlights current stock price on charts
- **Expiry Date Filtering**: Filter volume data by specific expiry dates
- **Data Summary Dashboard**: Shows total files, records, and latest data timestamp
- **Responsive Design**: Works on desktop and mobile devices
- **Dark Theme**: Professional dark interface optimized for trading

## Getting Started

### Prerequisites

- Node.js (version 16 or higher)
- npm or yarn

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. **(Optional) Configure Real-Time Stock Prices from NASDAQ:**
   
   For real-time NASDAQ stock prices, get a free Finnhub API key:
   
   - Sign up at [https://finnhub.io/register](https://finnhub.io/register)
   - Get your free API key (60 calls/minute)
   - Create a `.env` file in the project root:
     ```env
     VITE_FINNHUB_API_KEY=your_api_key_here
     ```
   
   **Note:** If no API key is provided, the app will use Yahoo Finance API as fallback.

4. Start the development server:
   ```bash
   npm run dev
   ```

5. Open your browser and navigate to `http://localhost:5173`

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## Tech Stack

- React 18
- TypeScript
- Vite
- Lucide React (icons)
- CSS3 with modern features

## Project Structure

```
optionAnalysis/
├── data/                       # Data directory for CSV files
│   └── options_data_*.csv     # Hourly data files
├── public/
│   └── api/
│       └── data-files         # API endpoint for file listing
├── scripts/
│   └── add-data-file.js       # Script to add new data files
├── src/
│   ├── components/
│   │   ├── OptionsDashboard.tsx    # Main dashboard component
│   │   ├── TickerList.tsx          # Ticker list view
│   │   └── VolumeProfileChart.tsx  # Volume profile chart
│   ├── utils/
│   │   ├── dataParser.ts           # CSV parsing and data processing
│   │   └── fileLoader.ts           # Multi-file loading utilities
│   ├── App.tsx                     # Application root
│   ├── App.css                     # Dashboard styles
│   ├── main.tsx                    # Application entry point
│   └── index.css                   # Global styles
├── DATA_STRUCTURE.md              # Data structure documentation
└── README.md                      # This file
```

## Data Management

### File Naming Convention
All data files must follow this pattern:
```
options_data_YYYY-MM-DD_HH-MM.csv
```

### Adding New Data Files

#### Method 1: Using the Script
```bash
# Add current data with current timestamp
node scripts/add-data-file.js your-data.csv

# Add data with specific timestamp
node scripts/add-data-file.js your-data.csv "2024-01-15T14:30:00"
```

#### Method 2: Manual Addition
1. Place CSV file in `data/` directory
2. Name it according to the convention
3. Update `public/api/data-files` endpoint
4. Refresh dashboard

### Data Format
The dashboard expects CSV data with the following structure:
- Ticker symbol
- Strike price
- Expiry date
- Option type (Call/Put)
- Volume
- Premium
- Open Interest
- Timestamp

## Usage

1. **Data Summary**: View total files loaded, records, and latest data timestamp
2. **Browse Tickers**: View all available tickers sorted by recent activity
3. **Select Ticker**: Click on any ticker to view detailed volume profile
4. **Dual Charts**: Analyze both call/put volume and total volume side-by-side
5. **Filter by Expiry**: Use expiry date buttons to filter data for specific dates
6. **Volume Analysis**: Use vertical price charts to identify high-volume strike prices
7. **Make Decisions**: Use the comprehensive data to make informed options trading decisions

## Multi-File Features

- **Automatic Merging**: Data from multiple files is automatically merged
- **Chronological Sorting**: Most recent data appears first
- **Source Tracking**: Each record tracks which file it came from
- **Time Range Filtering**: Filter data by specific time periods
- **Data Freshness**: Always shows the most recent data available

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## License

MIT License
