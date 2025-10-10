# Option Analysis Dashboard

A modern React dashboard for options trading analysis and volume profile visualization.

## Features

- **Ticker List View**: Browse all available tickers with volume summaries
- **Volume Profile Charts**: Interactive charts showing call/put volume distribution by strike price
- **Expiry Date Filtering**: Filter volume data by specific expiry dates
- **Real-time Data**: Loads options flow data from Discord CSV exports
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

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open your browser and navigate to `http://localhost:3000`

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
src/
├── components/
│   ├── OptionsDashboard.tsx    # Main dashboard component
│   ├── TickerList.tsx          # Ticker list view
│   └── VolumeProfileChart.tsx  # Volume profile chart
├── utils/
│   └── dataParser.ts           # CSV parsing and data processing
├── App.tsx                     # Application root
├── App.css                     # Dashboard styles
├── main.tsx                    # Application entry point
└── index.css                   # Global styles
```

## Data Format

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

1. **Browse Tickers**: View all available tickers sorted by total volume
2. **Select Ticker**: Click on any ticker to view detailed volume profile
3. **Filter by Expiry**: Use expiry date buttons to filter data for specific dates
4. **Analyze Volume**: Use the volume profile chart to identify high-volume strike prices
5. **Make Decisions**: Use the data to make informed options trading decisions

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## License

MIT License
