import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ArrowLeft, Calendar, Database, Clock, FileText, RefreshCw } from 'lucide-react';
import TickerList from './TickerList';
import VolumeProfileChart from './VolumeProfileChart';
import TradeList from './TradeList';
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
import { loadAllDataFiles } from '../utils/fileLoader';

// We'll load the CSV data via fetch instead of import

const OptionsDashboard: React.FC = () => {
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [selectedExpiry, setSelectedExpiry] = useState<string | null>(null);
  const [optionData, setOptionData] = useState<OptionData[]>([]);
  const [dataInfo, setDataInfo] = useState<MergedDataInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadAllData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Load all CSV files from the data directory
        const loadedFiles = await loadAllDataFiles();
        
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
        
        console.log(`Loaded ${info.totalFiles} files with ${info.totalRecords} total records`);
      } catch (error) {
        console.error('Error loading data files:', error);
        setError(error instanceof Error ? error.message : 'Failed to load data');
        setLoading(false);
      }
    };

    loadAllData();
  }, []);

  const tickerSummaries = useMemo(() => {
    return getTickerSummaries(optionData);
  }, [optionData]);


  const expiryDates = useMemo(() => {
    if (!selectedTicker) return [];
    return getExpiryDatesForTicker(optionData, selectedTicker);
  }, [optionData, selectedTicker]);

  const volumeProfileData = useMemo(() => {
    if (!selectedTicker) return [];
    return getVolumeProfileForTicker(optionData, selectedTicker, selectedExpiry || undefined);
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

  const handleRefreshData = useCallback(() => {
    clearDataCache();
    window.location.reload();
  }, []);

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
          {/* Data Summary Header */}
          {dataInfo && (
            <div className="data-summary-header">
              <div className="summary-stats">
                <div className="summary-stat">
                  <Database className="stat-icon" />
                  <span className="stat-label">Files Loaded</span>
                  <span className="stat-value">{dataInfo.totalFiles}</span>
                </div>
                <div className="summary-stat">
                  <FileText className="stat-icon" />
                  <span className="stat-label">Total Records</span>
                  <span className="stat-value">{dataInfo.totalRecords.toLocaleString()}</span>
                </div>
                <div className="summary-stat">
                  <Clock className="stat-icon" />
                  <span className="stat-label">Latest Data</span>
                  <span className="stat-value">
                    {dataInfo.dateRange.latest?.toLocaleString() || 'Unknown'}
                  </span>
                </div>
                <div className="summary-stat">
                  <button 
                    className="refresh-button" 
                    onClick={handleRefreshData}
                    title="Refresh data and clear cache"
                  >
                    <RefreshCw className="stat-icon" />
                    <span className="stat-label">Refresh</span>
                  </button>
                </div>
              </div>
            </div>
          )}

      {!selectedTicker ? (
        <TickerList 
          tickers={tickerSummaries} 
          onTickerSelect={handleTickerSelect} 
        />
      ) : (
        <div className="ticker-detail-view">
          <div className="detail-header">
            <button className="back-button" onClick={handleBackToList}>
              <ArrowLeft className="back-icon" />
              Back to Ticker List
            </button>
            <h2>{selectedTicker} Options Analysis</h2>
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
                currentPrice={highestVolumeData?.strike}
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
                currentPrice={highestVolumeData?.strike}
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

          {/* Trade List */}
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
      )}
    </div>
  );
};

export default OptionsDashboard;
