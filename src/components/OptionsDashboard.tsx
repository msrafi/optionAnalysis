import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ArrowLeft, Calendar, RefreshCw, Search } from 'lucide-react';
import TickerList from './TickerList';
import VolumeProfileChart from './VolumeProfileChart';
import TradeList from './TradeList';
import StrikeExpiryHeatmap from './StrikeExpiryHeatmap';
import TickerPsychologyAnalysis from './TickerPsychologyAnalysis';
import TradingViewChart from './TradingViewChart';
import PunchcardChart from './PunchcardChart';
import { 
  mergeDataFromFiles,
  getTickerSummaries, 
  getVolumeProfileForTicker, 
  getExpiryDatesForTicker,
  getHighestVolumeData,
  clearDataCache,
  OptionData,
  MergedDataInfo,
  parseTimestampFromData
} from '../utils/dataParser';
import { loadAllDataFiles, clearFileCache, loadCombinedFileMetadata } from '../utils/fileLoader';
import { getCurrentPrice, clearPriceCache } from '../utils/stockPrice';
import { clearAllApplicationCaches } from '../utils/sessionStorageManager';

// We'll load the CSV data via fetch instead of import

export interface OptionsDashboardProps {
  activeDashboard: 'options' | 'darkpool' | 'psychology';
  setActiveDashboard: (dashboard: 'options' | 'darkpool' | 'psychology') => void;
}

type DateFilter = 'all' | 'last5days' | 'past3days' | 'past1day';

const OptionsDashboard: React.FC<OptionsDashboardProps> = ({ activeDashboard, setActiveDashboard }) => {
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [selectedExpiry, setSelectedExpiry] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [optionData, setOptionData] = useState<OptionData[]>([]);
  const [dataInfo, setDataInfo] = useState<MergedDataInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [priceSource, setPriceSource] = useState<'api' | 'none'>('none');
  const [isPriceCached, setIsPriceCached] = useState(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [metadata, setMetadata] = useState<{
    generatedAt: string;
    sourceFiles: {
      count: number;
      latest: string;
      latestModified: string;
    };
    combinedFile: {
      records: {
        uniqueAfterDedup: number;
      };
    };
  } | null>(null);

  // Use ref to prevent double loading in React StrictMode
  const loadingRef = React.useRef(false);
  
  useEffect(() => {
    // Prevent double execution in React StrictMode
    if (loadingRef.current) return;
    loadingRef.current = true;
    
    const loadAllData = async (bustCache: boolean = false) => {
      try {
        setLoading(true);
        setError(null);
        
        // Load all CSV files from the data directory
        const loadedFiles = await loadAllDataFiles(bustCache);
        
        if (loadedFiles.length === 0) {
          throw new Error('Combined data file not found');
        }
        
        // Parse data from the combined file (mergeDataFromFiles still works for single file)
        const { mergedData, info } = mergeDataFromFiles(
          loadedFiles.map(file => ({
            filename: file.filename,
            data: file.data,
            timestamp: file.timestamp
          }))
        );
        
        setOptionData(mergedData);
        setDataInfo(info);
        
        // Load metadata to show when data was last updated
        const fileMetadata = await loadCombinedFileMetadata();
        if (fileMetadata) {
          setMetadata(fileMetadata);
          if (import.meta.env.DEV) {
            console.log(`📅 Data generated: ${new Date(fileMetadata.generatedAt).toLocaleString()}`);
            console.log(`📁 Latest source file: ${fileMetadata.sourceFiles.latest}`);
          }
        }
        
        setLoading(false);
        
        if (import.meta.env.DEV) {
          console.log(`Loaded combined data file with ${info.totalRecords} total records`);
          if (info.files && info.files.length > 0) {
            console.log(`📅 Data file: ${info.files[0].filename}`);
          }
        }
      } catch (error) {
        console.error('Error loading data files:', error);
        setError(error instanceof Error ? error.message : 'Failed to load data');
        setLoading(false);
        loadingRef.current = false; // Reset on error so retry works
      }
    };

    // Always use cache busting on initial load to ensure we get latest data
    loadAllData(true); // Cache busting enabled on mount to detect new files
    
    // Cleanup function
    return () => {
      // Don't reset ref here - we want to prevent double loads
    };
  }, []);

  const tickerSummaries = useMemo(() => {
    return getTickerSummaries(optionData);
  }, [optionData]);

  const filteredTickerSummaries = useMemo(() => {
    if (!searchTerm.trim()) {
      return tickerSummaries;
    }
    
    const searchLower = searchTerm.toLowerCase();
    return tickerSummaries.filter(ticker => 
      ticker.ticker.toLowerCase().includes(searchLower)
    );
  }, [tickerSummaries, searchTerm]);


  // Helper function to check if a date is a trading day (Monday-Friday)
  const isTradingDay = useCallback((date: Date): boolean => {
    const dayOfWeek = date.getDay();
    return dayOfWeek >= 1 && dayOfWeek <= 5; // Monday = 1, Friday = 5
  }, []);

  // Helper function to get the most recent trading day with data from trades
  const getMostRecentTradingDayWithData = useCallback((trades: OptionData[]): Date | null => {
    const dates = new Set<string>();
    
    trades.forEach(trade => {
      const tradeDate = parseTimestampFromData(trade.timestamp);
      if (tradeDate && isTradingDay(tradeDate)) {
        // Use local date components to avoid timezone issues
        const year = tradeDate.getFullYear();
        const month = tradeDate.getMonth();
        const day = tradeDate.getDate();
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        dates.add(dateStr);
      }
    });
    
    if (dates.size === 0) return null;
    
    const sortedDates = Array.from(dates)
      .map(dateStr => {
        const [year, month, day] = dateStr.split('-').map(Number);
        return new Date(year, month - 1, day);
      })
      .sort((a, b) => b.getTime() - a.getTime());
    
    return sortedDates[0];
  }, [isTradingDay]);

  // Helper function to get previous trading day
  const getPreviousTradingDay = useCallback((date: Date): Date => {
    const prevDay = new Date(date);
    prevDay.setDate(prevDay.getDate() - 1);
    
    // Skip weekends
    while (!isTradingDay(prevDay)) {
      prevDay.setDate(prevDay.getDate() - 1);
    }
    
    return prevDay;
  }, [isTradingDay]);

  // Filter trades by date filter
  const filterTradesByDate = useCallback((trades: OptionData[], filter: DateFilter): OptionData[] => {
    if (filter === 'all') {
      return trades;
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    // Find the most recent trading day with data
    const mostRecentTradingDay = getMostRecentTradingDayWithData(trades);
    if (!mostRecentTradingDay) return trades; // No trading days found, return all
    
    let startDate: Date;
    let endDate: Date;
    
    if (filter === 'last5days') {
      // Last 5 trading days including the most recent trading day
      endDate = new Date(mostRecentTradingDay);
      endDate.setDate(endDate.getDate() + 1); // End of most recent trading day (exclusive)
      
      startDate = new Date(mostRecentTradingDay);
      // Go back 4 more trading days
      for (let i = 0; i < 4; i++) {
        startDate = getPreviousTradingDay(startDate);
      }
    } else if (filter === 'past3days') {
      // Past 3 trading days (not including the most recent if it's today)
      const mostRecentDateOnly = new Date(mostRecentTradingDay.getFullYear(), mostRecentTradingDay.getMonth(), mostRecentTradingDay.getDate());
      const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      
      if (mostRecentDateOnly.getTime() === todayDateOnly.getTime() && isTradingDay(today)) {
        // Most recent is today, so exclude today
        endDate = new Date(today);
        startDate = getPreviousTradingDay(today);
        for (let i = 0; i < 2; i++) {
          startDate = getPreviousTradingDay(startDate);
        }
      } else {
        // Most recent is not today, include it
        endDate = new Date(mostRecentTradingDay);
        endDate.setDate(endDate.getDate() + 1);
        startDate = getPreviousTradingDay(mostRecentTradingDay);
        for (let i = 0; i < 2; i++) {
          startDate = getPreviousTradingDay(startDate);
        }
      }
    } else {
      // Past 1 day: Show the most recent trading day with data
      startDate = new Date(mostRecentTradingDay);
      endDate = new Date(mostRecentTradingDay);
      endDate.setDate(endDate.getDate() + 1); // End of most recent trading day (exclusive)
    }

    return trades.filter(trade => {
      const tradeDate = parseTimestampFromData(trade.timestamp);
      if (!tradeDate) return false;
      
      // Get date only (without time) for comparison
      const tradeDateOnly = new Date(tradeDate.getFullYear(), tradeDate.getMonth(), tradeDate.getDate());
      
      return tradeDateOnly >= startDate && tradeDateOnly < endDate;
    });
  }, [getMostRecentTradingDayWithData, getPreviousTradingDay, isTradingDay]);

  const expiryDates = useMemo(() => {
    if (!selectedTicker) return [];
    return getExpiryDatesForTicker(optionData, selectedTicker);
  }, [optionData, selectedTicker]);

  const volumeProfileData = useMemo(() => {
    if (!selectedTicker) return [];
    // Apply date filter to trades before calculating volume profile
    const tickerFiltered = optionData.filter(option => 
      option.ticker === selectedTicker && 
      (!selectedExpiry || option.expiry === selectedExpiry)
    );
    const dateFiltered = filterTradesByDate(tickerFiltered, dateFilter);
    return getVolumeProfileForTicker(dateFiltered, selectedTicker, selectedExpiry || undefined);
  }, [optionData, selectedTicker, selectedExpiry, dateFilter, filterTradesByDate]);

  // Get filtered trades for the selected ticker and expiry, then apply date filter
  const filteredTrades = useMemo(() => {
    if (!selectedTicker) return [];
    const tickerExpiryFiltered = optionData.filter(trade => {
      const matchesTicker = trade.ticker === selectedTicker;
      const matchesExpiry = !selectedExpiry || trade.expiry === selectedExpiry;
      return matchesTicker && matchesExpiry;
    });
    return filterTradesByDate(tickerExpiryFiltered, dateFilter);
  }, [optionData, selectedTicker, selectedExpiry, dateFilter, filterTradesByDate]);

  const highestVolumeData = useMemo(() => {
    if (!selectedTicker) return null;
    // Apply date filter to trades before calculating highest volume
    const tickerFiltered = optionData.filter(option => 
      option.ticker === selectedTicker && 
      (!selectedExpiry || option.expiry === selectedExpiry)
    );
    const dateFiltered = filterTradesByDate(tickerFiltered, dateFilter);
    return getHighestVolumeData(dateFiltered, selectedTicker, selectedExpiry || undefined);
  }, [optionData, selectedTicker, selectedExpiry, dateFilter, filterTradesByDate]);

  const tickerTrades = useMemo(() => {
    if (!selectedTicker) return [];
    const tickerExpiryFiltered = optionData.filter(option => 
      option.ticker === selectedTicker && 
      (!selectedExpiry || option.expiry === selectedExpiry)
    );
    return filterTradesByDate(tickerExpiryFiltered, dateFilter);
  }, [optionData, selectedTicker, selectedExpiry, dateFilter, filterTradesByDate]);

  const handleTickerSelect = useCallback((ticker: string) => {
    setSelectedTicker(ticker);
    setSelectedExpiry(null); // Reset expiry selection when changing ticker
  }, []);

  const handleBackToList = useCallback(() => {
    setSelectedTicker(null);
    setSelectedExpiry(null);
  }, []);

  const handleExpirySelect = useCallback((expiry: string) => {
    setSelectedExpiry(expiry === selectedExpiry ? null : expiry);
  }, [selectedExpiry]);

  const handleRefreshData = useCallback(async () => {
    try {
      console.log('🔄 Performing hard refresh for options data...');
      
      // Clear ALL application caches including service worker caches
      await clearAllApplicationCaches();
      
      // Also clear individual caches for good measure
      clearDataCache();      // Clear options parsed data cache
      clearFileCache();      // Clear options file loading cache
      clearPriceCache();     // Clear stock price cache (shared)
      
      // Unregister service workers to ensure fresh data
      if ('serviceWorker' in navigator) {
        try {
          const registrations = await navigator.serviceWorker.getRegistrations();
          for (const registration of registrations) {
            await registration.unregister();
            console.log('✓ Service worker unregistered');
          }
        } catch (swError) {
          console.warn('Could not unregister service worker:', swError);
        }
      }
      
      console.log('✓ All caches cleared (session storage, service worker, and application caches)');
      console.log('🔄 Reloading options data with cache bypass...');
      
      // Small delay to ensure caches are fully cleared
      await new Promise(resolve => setTimeout(resolve, 100));
      
      setLoading(true);
      setError(null);
      
      // Load combined data file with cache busting enabled
      const loadedFiles = await loadAllDataFiles(true);
      
      if (loadedFiles.length === 0) {
        throw new Error('Combined data file not found');
      }
      
      // Parse data from the combined file
      const { mergedData, info } = mergeDataFromFiles(
        loadedFiles.map(file => ({
          filename: file.filename,
          data: file.data,
          timestamp: file.timestamp
        }))
      );
      
      setOptionData(mergedData);
      setDataInfo(info);
      
      // Log some sample trades to verify new data is loaded (always log for debugging)
      const latestTrades = mergedData.slice(0, 10);
      console.log('📊 Sample of latest trades after refresh:', latestTrades.map(t => ({
        ticker: t.ticker,
        timestamp: t.timestamp,
        sourceFile: t.sourceFile
      })));
      console.log('📁 Combined file loaded:', loadedFiles[0].filename);
      console.log('📈 Data summary:', {
        earliest: info.dateRange.earliest?.toISOString(),
        latest: info.dateRange.latest?.toISOString(),
        totalRecords: info.totalRecords
      });
      
      // Reset current price and reload it
      setCurrentPrice(null);
      setPriceSource('none');
      setIsPriceCached(false);
      
      // Reload price if a ticker is selected
      if (selectedTicker) {
        const { price, source, cached } = await getCurrentPrice(selectedTicker);
        setCurrentPrice(price);
        setPriceSource(source);
        setIsPriceCached(cached);
      }
      
      setLoading(false);
      
      console.log('✓ Data reloaded successfully:', {
        records: info.totalRecords,
        latestData: info.dateRange.latest
      });
    } catch (error) {
      console.error('Error during hard refresh:', error);
      setError(error instanceof Error ? error.message : 'Failed to refresh data');
      setLoading(false);
    }
  }, [selectedTicker]);

  // Fetch current stock price when ticker is selected (real-time API with 15min cache)
  useEffect(() => {
    if (!selectedTicker) {
      setCurrentPrice(null);
      setPriceSource('none');
      setIsPriceCached(false);
      return;
    }

    const fetchPrice = async () => {
      const result = await getCurrentPrice(selectedTicker);
      setCurrentPrice(result.price);
      setPriceSource(result.source);
      setIsPriceCached(result.cached);
      
      if (import.meta.env.DEV) {
        console.log(`Stock price for ${selectedTicker}:`, result.price, `(source: ${result.source}, cached: ${result.cached})`);
      }
    };

    fetchPrice();
  }, [selectedTicker]);

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="loading-spinner"></div>
        <p>Loading options data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-error">
        <div className="error-icon">⚠️</div>
        <h3>Error Loading Data</h3>
        <p>{error}</p>
        <button 
          className="retry-button" 
          onClick={() => window.location.reload()}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="options-dashboard">
      {/* Compact Header with Data Summary */}
      <header className="dashboard-header">
        <div className="header-left">
          <h1>Market Analysis Dashboard</h1>
          {dataInfo && (
            <div className="header-stats">
              <span className="header-stat">{dataInfo.totalRecords.toLocaleString()} records</span>
              {metadata && (
                <>
                  <span className="stat-separator">•</span>
                  <span className="header-stat" title={`Latest source: ${metadata.sourceFiles.latest}`}>
                    Updated: {new Date(metadata.generatedAt).toLocaleString('en-GB', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false
                    })}
                  </span>
                </>
              )}
            </div>
          )}
        </div>
        
        <div className="header-right">
          {!selectedTicker && (
            <div className="search-container-header">
              <Search className="search-icon" />
              <input
                type="text"
                className="search-input"
                placeholder="Search tickers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button 
                  className="clear-search"
                  onClick={() => setSearchTerm('')}
                  title="Clear search"
                >
                  ×
                </button>
              )}
            </div>
          )}
          
          <div className="nav-buttons">
            <button 
              className={`nav-button ${activeDashboard === 'options' ? 'active' : ''}`}
              onClick={() => setActiveDashboard('options')}
            >
              Options Analysis
            </button>
            <button 
              className={`nav-button ${activeDashboard === 'darkpool' ? 'active' : ''}`}
              onClick={() => setActiveDashboard('darkpool')}
            >
              Dark Pool Analysis
            </button>
            <button 
              className={`nav-button ${activeDashboard === 'psychology' ? 'active' : ''}`}
              onClick={() => setActiveDashboard('psychology')}
            >
              Overall Analysis
            </button>
          </div>
          
          <button 
            className="refresh-button-compact" 
            onClick={handleRefreshData}
            title="Hard Refresh - Clears all caches and reloads data from files"
          >
            <RefreshCw className="refresh-icon" />
            Hard Refresh
          </button>
        </div>
      </header>

      {!selectedTicker ? (
        <TickerList 
          tickers={filteredTickerSummaries} 
          onTickerSelect={handleTickerSelect}
          allData={optionData}
        />
      ) : (
        <div className="ticker-detail-view">
          <div className="detail-header">
            <button className="back-button" onClick={handleBackToList}>
              <ArrowLeft className="back-icon" />
              Back to Ticker List
            </button>
            <h2>{selectedTicker} Options Analysis</h2>
            {currentPrice && priceSource === 'api' ? (
              <span className="current-price-badge">
                <span className="price-indicator"></span>
                Current Price: ${currentPrice.toFixed(2)}
                <span className="price-status">
                  ({isPriceCached ? 'Cached' : 'Live'})
                </span>
              </span>
            ) : (
              <span className="price-unavailable">
                Price unavailable
              </span>
            )}
          </div>

          {/* Date Filter and Expiry Date Filter */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
            {/* Date Filter */}
            <div className="expiry-filter">
              <div className="filter-header">
                <Calendar className="filter-icon" />
                <span>Filter by Trade Date:</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginLeft: '1rem' }}>
                <select
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value as DateFilter)}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: '#1e1e1e',
                    color: '#fff',
                    border: '1px solid #444',
                    borderRadius: '4px',
                    fontSize: '14px',
                    cursor: 'pointer'
                  }}
                >
                  <option value="all">All Data</option>
                  <option value="last5days">Last 5 Trading Days</option>
                  <option value="past3days">Past 3 Trading Days</option>
                  <option value="past1day">Last Trading Day</option>
                </select>
                {dateFilter !== 'all' && tickerTrades.length > 0 && (() => {
                  const dates = new Set<string>();
                  tickerTrades.forEach(trade => {
                    const tradeDate = parseTimestampFromData(trade.timestamp);
                    if (tradeDate) {
                      const dateStr = tradeDate.toLocaleDateString('en-US', {
                        month: '2-digit',
                        day: '2-digit',
                        year: '2-digit'
                      });
                      dates.add(dateStr);
                    }
                  });
                  const includedDates = Array.from(dates).sort().reverse();
                  return includedDates.length > 0 ? (
                    <span style={{ fontSize: '13px', color: '#ccc' }}>
                      Showing: {includedDates.join(', ')}
                    </span>
                  ) : null;
                })()}
              </div>
            </div>

            {/* Expiry Date Filter */}
            <div className="expiry-filter">
              <div className="filter-header">
                <Calendar className="filter-icon" />
                <span>Filter by Expiry Date:</span>
              </div>
              <div className="expiry-buttons">
                <button 
                  className={`expiry-button ${!selectedExpiry ? 'active' : ''}`}
                  onClick={() => setSelectedExpiry(null)}
                >
                  All Expiries
                </button>
                {expiryDates.map((expiry) => (
                  <button
                    key={expiry}
                    className={`expiry-button ${selectedExpiry === expiry ? 'active' : ''}`}
                    onClick={() => handleExpirySelect(expiry)}
                  >
                    {new Date(expiry).toLocaleDateString()}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* TradingView Chart Section */}
          {selectedTicker && (
            <div className="tradingview-chart-section" style={{ marginBottom: '2rem', width: '100%' }}>
              <h3 style={{ marginBottom: '1rem' }}>Price Chart - {selectedTicker}</h3>
              <div style={{ 
                border: '1px solid #333', 
                borderRadius: '8px', 
                overflow: 'hidden',
                backgroundColor: '#1a1a1a'
              }}>
                <TradingViewChart 
                  symbol={selectedTicker}
                  height={500}
                  theme="dark"
                  interval="D"
                  style="1"
                />
              </div>
            </div>
          )}

          {/* Heatmap & Trade History - Two Column Layout */}
          <div className="heatmap-trades-section">
            {/* Left Column - Strike × Expiry Heatmap */}
            <div className="heatmap-column">
              <StrikeExpiryHeatmap 
                trades={tickerTrades}
                currentPrice={currentPrice || undefined}
              />
            </div>

            {/* Right Column - Trade List */}
            <div className="trades-column">
              <div className="trade-list-section">
                <h3>Trade History for {selectedTicker}</h3>
                <p>Found {tickerTrades.length} trades</p>
                <TradeList 
                  trades={tickerTrades}
                  ticker={selectedTicker}
                  expiry={selectedExpiry || undefined}
                />
              </div>
            </div>
          </div>

          {/* Punchcard Chart */}
          <div className="punchcard-section" style={{ marginTop: '2rem', width: '100%' }}>
            <PunchcardChart 
              trades={tickerTrades}
              ticker={selectedTicker}
            />
          </div>

          {/* Charts Section - Two Column Layout */}
          <div className="charts-section">
            {/* Left Column - Call/Put Volume Chart */}
            <div className="chart-column">
              <VolumeProfileChart 
                data={volumeProfileData}
                highestVolumeData={highestVolumeData}
                ticker={selectedTicker}
                expiry={selectedExpiry || undefined}
                chartType="callput"
                currentPrice={currentPrice || undefined}
                trades={filteredTrades}
              />
            </div>
            
            {/* Right Column - Total Volume Chart */}
            <div className="chart-column">
              <VolumeProfileChart 
                data={volumeProfileData}
                highestVolumeData={highestVolumeData}
                ticker={selectedTicker}
                expiry={selectedExpiry || undefined}
                chartType="total"
                currentPrice={currentPrice || undefined}
                trades={filteredTrades}
              />
            </div>
          </div>

          {/* Summary Statistics */}
          <div className="summary-stats">
            <div className="stat-card">
              <h4>Total Volume</h4>
              <p>{volumeProfileData.reduce((sum, item) => sum + item.totalVolume, 0).toLocaleString()}</p>
            </div>
            <div className="stat-card">
              <h4>Call Volume</h4>
              <p>{volumeProfileData.reduce((sum, item) => sum + item.callVolume, 0).toLocaleString()}</p>
            </div>
            <div className="stat-card">
              <h4>Put Volume</h4>
              <p>{volumeProfileData.reduce((sum, item) => sum + item.putVolume, 0).toLocaleString()}</p>
            </div>
            <div className="stat-card">
              <h4>Open Interest</h4>
              <p>{volumeProfileData.reduce((sum, item) => sum + item.openInterest, 0).toLocaleString()}</p>
            </div>
          </div>

          {/* Overall Analysis */}
          <TickerPsychologyAnalysis 
            ticker={selectedTicker}
            trades={tickerTrades}
          />
        </div>
      )}
    </div>
  );
};

export default OptionsDashboard;
