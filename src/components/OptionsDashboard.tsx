import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ArrowLeft, Calendar, RefreshCw, Search } from 'lucide-react';
import TickerList from './TickerList';
import VolumeProfileChart from './VolumeProfileChart';
import TradeList from './TradeList';
import StrikeExpiryHeatmap from './StrikeExpiryHeatmap';
import { 
  mergeDataFromFiles,
  getTickerSummaries, 
  getVolumeProfileForTicker, 
  getExpiryDatesForTicker,
  getHighestVolumeData,
  clearDataCache,
  OptionData,
  MergedDataInfo
} from '../utils/dataParser';
import { loadAllDataFiles, clearFileCache } from '../utils/fileLoader';
import { getCurrentPrice, clearPriceCache } from '../utils/stockPrice';

// We'll load the CSV data via fetch instead of import

const OptionsDashboard: React.FC = () => {
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [selectedExpiry, setSelectedExpiry] = useState<string | null>(null);
  const [optionData, setOptionData] = useState<OptionData[]>([]);
  const [dataInfo, setDataInfo] = useState<MergedDataInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [priceSource, setPriceSource] = useState<'api' | 'none'>('none');
  const [isPriceCached, setIsPriceCached] = useState(false);
  const [searchTerm, setSearchTerm] = useState<string>('');

  useEffect(() => {
    const loadAllData = async (bustCache: boolean = false) => {
      try {
        setLoading(true);
        setError(null);
        
        // Load all CSV files from the data directory
        const loadedFiles = await loadAllDataFiles(bustCache);
        
        if (loadedFiles.length === 0) {
          throw new Error('No data files found in the data directory');
        }
        
        // Merge data from all files
        const { mergedData, info } = mergeDataFromFiles(
          loadedFiles.map(file => ({
            filename: file.filename,
            data: file.data,
            timestamp: file.timestamp
          }))
        );
        
        setOptionData(mergedData);
        setDataInfo(info);
        setLoading(false);
        
        if (import.meta.env.DEV) {
          console.log(`Loaded ${info.totalFiles} files with ${info.totalRecords} total records`);
        }
      } catch (error) {
        console.error('Error loading data files:', error);
        setError(error instanceof Error ? error.message : 'Failed to load data');
        setLoading(false);
      }
    };

    loadAllData(false); // Normal load on mount
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


  const expiryDates = useMemo(() => {
    if (!selectedTicker) return [];
    return getExpiryDatesForTicker(optionData, selectedTicker);
  }, [optionData, selectedTicker]);

  const volumeProfileData = useMemo(() => {
    if (!selectedTicker) return [];
    return getVolumeProfileForTicker(optionData, selectedTicker, selectedExpiry || undefined);
  }, [optionData, selectedTicker, selectedExpiry]);

  // Get filtered trades for the selected ticker and expiry
  const filteredTrades = useMemo(() => {
    if (!selectedTicker) return [];
    return optionData.filter(trade => {
      const matchesTicker = trade.ticker === selectedTicker;
      const matchesExpiry = !selectedExpiry || trade.expiry === selectedExpiry;
      return matchesTicker && matchesExpiry;
    });
  }, [optionData, selectedTicker, selectedExpiry]);

  const highestVolumeData = useMemo(() => {
    if (!selectedTicker) return null;
    return getHighestVolumeData(optionData, selectedTicker, selectedExpiry || undefined);
  }, [optionData, selectedTicker, selectedExpiry]);

  const tickerTrades = useMemo(() => {
    if (!selectedTicker) return [];
    return optionData.filter(option => 
      option.ticker === selectedTicker && 
      (!selectedExpiry || option.expiry === selectedExpiry)
    );
  }, [optionData, selectedTicker, selectedExpiry]);

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
      console.log('🔄 Performing hard refresh...');
      
      // Clear all application caches
      clearDataCache();      // Clear parsed data cache
      clearPriceCache();     // Clear stock price cache
      clearFileCache();      // Clear file loading cache
      
      // Clear browser storage
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch (error) {
        console.warn('Could not clear storage:', error);
      }
      
      console.log('✓ All caches cleared');
      console.log('🔄 Reloading data with cache bypass...');
      
      setLoading(true);
      setError(null);
      
      // Load all CSV files with cache busting enabled
      const loadedFiles = await loadAllDataFiles(true);
      
      if (loadedFiles.length === 0) {
        throw new Error('No data files found in the data directory');
      }
      
      // Merge data from all files
      const { mergedData, info } = mergeDataFromFiles(
        loadedFiles.map(file => ({
          filename: file.filename,
          data: file.data,
          timestamp: file.timestamp
        }))
      );
      
      setOptionData(mergedData);
      setDataInfo(info);
      
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
        files: info.totalFiles,
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
        <p>Loading options data from multiple files...</p>
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
          <h1>Option Analysis Dashboard</h1>
          {dataInfo && (
            <div className="header-stats">
              <span className="header-stat">{dataInfo.totalFiles} files</span>
              <span className="stat-separator">•</span>
              <span className="header-stat">{dataInfo.totalRecords.toLocaleString()} records</span>
              <span className="stat-separator">•</span>
              <span className="header-stat">{dataInfo.dateRange.latest?.toLocaleString() || 'Unknown'}</span>
            </div>
          )}
        </div>
        
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
        
        <button 
          className="refresh-button-compact" 
          onClick={handleRefreshData}
          title="Hard Refresh - Clears all caches and reloads data from files"
        >
          <RefreshCw className="refresh-icon" />
          Hard Refresh
        </button>
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
        </div>
      )}
    </div>
  );
};

export default OptionsDashboard;
