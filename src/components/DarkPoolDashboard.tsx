import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ArrowLeft, RefreshCw, Search } from 'lucide-react';
import DarkPoolList from './DarkPoolList';
import { 
  mergeDarkPoolDataFromFiles,
  getDarkPoolTickerSummaries, 
  clearDarkPoolDataCache,
  DarkPoolData,
  MergedDataInfo
} from '../utils/dataParser';
import { loadAllDarkPoolDataFiles, clearDarkPoolFileCache } from '../utils/fileLoader';
import { getCurrentPrice, clearPriceCache } from '../utils/stockPrice';

export interface DarkPoolDashboardProps {
  activeDashboard: 'options' | 'darkpool';
  setActiveDashboard: (dashboard: 'options' | 'darkpool') => void;
}

const DarkPoolDashboard: React.FC<DarkPoolDashboardProps> = ({ activeDashboard, setActiveDashboard }) => {
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [darkPoolData, setDarkPoolData] = useState<DarkPoolData[]>([]);
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
        
        // Load all dark pool CSV files from the data directory
        const loadedFiles = await loadAllDarkPoolDataFiles(bustCache);
        
        if (loadedFiles.length === 0) {
          throw new Error('No dark pool data files found in the data directory');
        }
        
        // Merge data from all files
        const { mergedData, info } = mergeDarkPoolDataFromFiles(
          loadedFiles.map(file => ({
            filename: file.filename,
            data: file.data,
            timestamp: file.timestamp
          }))
        );
        
        setDarkPoolData(mergedData);
        setDataInfo(info);
        setLoading(false);
        
        if (import.meta.env.DEV) {
          console.log(`Loaded ${info.totalFiles} dark pool files with ${info.totalRecords} total records`);
        }
      } catch (error) {
        console.error('Error loading dark pool data files:', error);
        setError(error instanceof Error ? error.message : 'Failed to load dark pool data');
        setLoading(false);
      }
    };

    loadAllData(false); // Normal load on mount
  }, []);

  const tickerSummaries = useMemo(() => {
    return getDarkPoolTickerSummaries(darkPoolData);
  }, [darkPoolData]);

  const filteredTickerSummaries = useMemo(() => {
    if (!searchTerm.trim()) {
      return tickerSummaries;
    }
    
    const searchLower = searchTerm.toLowerCase();
    return tickerSummaries.filter(ticker => 
      ticker.ticker.toLowerCase().includes(searchLower)
    );
  }, [tickerSummaries, searchTerm]);

  // Get filtered trades for the selected ticker
  const filteredTrades = useMemo(() => {
    if (!selectedTicker) return [];
    return darkPoolData.filter(trade => trade.ticker === selectedTicker);
  }, [darkPoolData, selectedTicker]);

  const handleTickerSelect = useCallback((ticker: string) => {
    setSelectedTicker(ticker);
  }, []);

  const handleBackToList = useCallback(() => {
    setSelectedTicker(null);
  }, []);

  const handleRefreshData = useCallback(async () => {
    try {
      console.log('🔄 Performing hard refresh for dark pool data...');
      
      // Clear only dark pool related caches
      clearDarkPoolDataCache();      // Clear dark pool parsed data cache
      clearDarkPoolFileCache();      // Clear dark pool file loading cache
      clearPriceCache();             // Clear stock price cache (shared)
      
      console.log('✓ Dark pool caches cleared');
      console.log('🔄 Reloading dark pool data with cache bypass...');
      
      setLoading(true);
      setError(null);
      
      // Load all dark pool CSV files with cache busting enabled
      const loadedFiles = await loadAllDarkPoolDataFiles(true);
      
      if (loadedFiles.length === 0) {
        throw new Error('No dark pool data files found in the data directory');
      }
      
      // Merge data from all files
      const { mergedData, info } = mergeDarkPoolDataFromFiles(
        loadedFiles.map(file => ({
          filename: file.filename,
          data: file.data,
          timestamp: file.timestamp
        }))
      );
      
      setDarkPoolData(mergedData);
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
      
      console.log('✓ Dark pool data reloaded successfully:', {
        files: info.totalFiles,
        records: info.totalRecords,
        latestData: info.dateRange.latest
      });
    } catch (error) {
      console.error('Error during hard refresh:', error);
      setError(error instanceof Error ? error.message : 'Failed to refresh dark pool data');
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
        <p>Loading dark pool data from multiple files...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-error">
        <div className="error-icon">⚠️</div>
        <h3>Error Loading Dark Pool Data</h3>
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
    <div className="darkpool-dashboard">
      {/* Compact Header with Data Summary */}
      <header className="dashboard-header">
        <div className="header-left">
          <h1>Market Analysis Dashboard</h1>
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
        <div className="ticker-list-container">
          <div className="ticker-list-header">
            <h2>Dark Pool Tickers</h2>
            <p>Select a ticker to view detailed dark pool activity</p>
          </div>
          
          <div className="ticker-grid">
            {filteredTickerSummaries.map((ticker) => (
              <div 
                key={ticker.ticker}
                className="ticker-card"
                onClick={() => handleTickerSelect(ticker.ticker)}
              >
                <div className="ticker-symbol">{ticker.ticker}</div>
                <div className="ticker-stats">
                  <div className="stat-row">
                    <span className="stat-label">Total Value:</span>
                    <span className="stat-value">
                      ${(ticker.totalValue / 1000000).toFixed(1)}M
                    </span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-label">Quantity:</span>
                    <span className="stat-value">
                      {(ticker.totalQuantity / 1000).toFixed(0)}K
                    </span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-label">Trades:</span>
                    <span className="stat-value">{ticker.tradeCount}</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-label">Avg Price:</span>
                    <span className="stat-value">${ticker.averagePrice.toFixed(2)}</span>
                  </div>
                </div>
                <div className="ticker-footer">
                  <span className="last-activity">
                    Last: {ticker.lastActivity}
                  </span>
                </div>
              </div>
            ))}
          </div>
          
          {filteredTickerSummaries.length === 0 && (
            <div className="no-tickers-message">
              <p>No tickers found matching your search.</p>
            </div>
          )}
        </div>
      ) : (
        <div className="ticker-detail-view">
          <div className="detail-header">
            <button className="back-button" onClick={handleBackToList}>
              <ArrowLeft className="back-icon" />
              Back to Ticker List
            </button>
            <h2>{selectedTicker} Dark Pool Analysis</h2>
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

          {/* Summary Statistics */}
          <div className="summary-stats">
            <div className="stat-card">
              <h4>Total Trades</h4>
              <p>{filteredTrades.length.toLocaleString()}</p>
            </div>
            <div className="stat-card">
              <h4>Total Quantity</h4>
              <p>{filteredTrades.reduce((sum, trade) => sum + trade.quantity, 0).toLocaleString()}</p>
            </div>
            <div className="stat-card">
              <h4>Total Value</h4>
              <p>
                ${filteredTrades.reduce((sum, trade) => {
                  const value = parseFloat(trade.totalValue.replace(/[$,]/g, ''));
                  return sum + value;
                }, 0).toLocaleString()}
              </p>
            </div>
            <div className="stat-card">
              <h4>Average Price</h4>
              <p>
                ${filteredTrades.length > 0 
                  ? (filteredTrades.reduce((sum, trade) => sum + trade.price, 0) / filteredTrades.length).toFixed(2)
                  : '0.00'
                }
              </p>
            </div>
          </div>

          {/* Dark Pool Trade List */}
          <div className="darkpool-trades-section">
            <DarkPoolList 
              trades={filteredTrades}
              ticker={selectedTicker}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default DarkPoolDashboard;
