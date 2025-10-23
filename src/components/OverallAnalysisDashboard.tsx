import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, RefreshCw, AlertTriangle } from 'lucide-react';
import { 
  mergeDataFromFiles,
  clearDataCache,
  OptionData,
  MergedDataInfo
} from '../utils/dataParser';
import { loadAllDataFiles } from '../utils/fileLoader';
import { clearAllApplicationCaches } from '../utils/sessionStorageManager';
import TickerWeeklyAnalysisComponent from './TickerWeeklyAnalysis';
import { TickerWeeklyAnalysis, analyzeTickerWeeklySentiment } from '../utils/tradePsychology';

type DashboardType = 'options' | 'darkpool' | 'psychology';

type SortField = 'volume' | 'premium' | 'recent' | 'sentiment' | 'trades' | 'ticker';
type SortDirection = 'asc' | 'desc';

interface OverallAnalysisDashboardProps {
  activeDashboard: DashboardType;
  setActiveDashboard: (dashboard: DashboardType) => void;
}

const OverallAnalysisDashboard: React.FC<OverallAnalysisDashboardProps> = ({ setActiveDashboard }) => {
  const [optionData, setOptionData] = useState<OptionData[]>([]);
  const [, setDataInfo] = useState<MergedDataInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('volume');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [loadingTimeout, setLoadingTimeout] = useState<NodeJS.Timeout | null>(null);
  
  useEffect(() => {
    const loadAllData = async (bustCache: boolean = false) => {
      try {
        setLoading(true);
        setError(null);
        
        // Set a timeout to prevent infinite loading
        const timeout = setTimeout(() => {
          setError('Loading is taking longer than expected. This might be a cache issue. Try refreshing or clearing cache.');
        }, 15000); // 15 second timeout
        
        setLoadingTimeout(timeout);
        
        // Load all CSV files from the data directory
        const loadedFiles = await loadAllDataFiles(bustCache);
        
        if (loadedFiles.length === 0) {
          throw new Error('No data files found in the data directory');
        }
        
        // Merge data from all files
        const { mergedData, info } = mergeDataFromFiles(loadedFiles);
        
        setOptionData(mergedData);
        setDataInfo(info);
        
        // Clear timeout on success
        if (timeout) {
          clearTimeout(timeout);
          setLoadingTimeout(null);
        }
        
        if (import.meta.env.DEV) {
          console.log(`Loaded ${mergedData.length} option records from ${info.totalFiles} files`);
          console.log('Date range:', info.dateRange);
        }
      } catch (err) {
        console.error('Error loading data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load data');
        
        // Clear timeout on error
        if (loadingTimeout) {
          clearTimeout(loadingTimeout);
          setLoadingTimeout(null);
        }
      } finally {
        setLoading(false);
      }
    };

    // Load data on mount
    loadAllData();
    
    // Cleanup timeout on unmount
    return () => {
      if (loadingTimeout) {
        clearTimeout(loadingTimeout);
      }
    };
  }, []);

  

  const handleRefresh = async () => {
    // Clear all caches
    clearDataCache();
    clearAllApplicationCaches();
    
    const loadAllData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Set timeout for refresh
        const timeout = setTimeout(() => {
          setError('Refresh is taking longer than expected. Try clearing cache manually.');
        }, 15000);
        
        setLoadingTimeout(timeout);
        
        const loadedFiles = await loadAllDataFiles(true);
        
        if (loadedFiles.length === 0) {
          throw new Error('No data files found in the data directory');
        }
        
        const { mergedData, info } = mergeDataFromFiles(loadedFiles);
        
        setOptionData(mergedData);
        setDataInfo(info);
        
        // Clear timeout on success
        if (timeout) {
          clearTimeout(timeout);
          setLoadingTimeout(null);
        }
        
        if (import.meta.env.DEV) {
          console.log(`Refreshed: Loaded ${mergedData.length} option records from ${info.totalFiles} files`);
        }
      } catch (err) {
        console.error('Error refreshing data:', err);
        setError(err instanceof Error ? err.message : 'Failed to refresh data');
        
        // Clear timeout on error
        if (loadingTimeout) {
          clearTimeout(loadingTimeout);
          setLoadingTimeout(null);
        }
      } finally {
        setLoading(false);
      }
    };
    
    await loadAllData();
  };

  const handleClearCache = () => {
    clearDataCache();
    clearAllApplicationCaches();
    setError(null);
    setLoading(true);
    
    // Reload after clearing cache
    setTimeout(() => {
      window.location.reload();
    }, 100);
  };

  // Sort ticker analyses based on current sort settings
  const sortedTickerAnalyses = useMemo(() => {
    if (!optionData || optionData.length === 0) return [];
    
    const analyses = analyzeTickerWeeklySentiment(optionData);
    
    return analyses.sort((a: TickerWeeklyAnalysis, b: TickerWeeklyAnalysis) => {
      let aValue: number | string;
      let bValue: number | string;
      
      switch (sortField) {
        case 'volume':
          aValue = a.weeks.reduce((sum, week) => sum + week.totalVolume, 0);
          bValue = b.weeks.reduce((sum, week) => sum + week.totalVolume, 0);
          break;
        case 'premium':
          aValue = a.weeks.reduce((sum, week) => sum + week.totalPremium, 0);
          bValue = b.weeks.reduce((sum, week) => sum + week.totalPremium, 0);
          break;
        case 'trades':
          aValue = a.weeks.reduce((sum, week) => sum + week.totalTrades, 0);
          bValue = b.weeks.reduce((sum, week) => sum + week.totalTrades, 0);
          break;
        case 'recent':
          // Sort by most recent week's activity (volume + premium)
          const aRecentWeek = a.weeks[a.weeks.length - 1];
          const bRecentWeek = b.weeks[b.weeks.length - 1];
          aValue = (aRecentWeek?.totalVolume || 0) + (aRecentWeek?.totalPremium || 0);
          bValue = (bRecentWeek?.totalVolume || 0) + (bRecentWeek?.totalPremium || 0);
          break;
        case 'sentiment':
          // Convert sentiment to numeric value for sorting
          const sentimentOrder = { bullish: 3, bearish: 2, mixed: 1, neutral: 0 };
          aValue = sentimentOrder[a.overallSentiment];
          bValue = sentimentOrder[b.overallSentiment];
          break;
        case 'ticker':
          aValue = a.ticker;
          bValue = b.ticker;
          break;
        default:
          aValue = 0;
          bValue = 0;
      }
      
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc' 
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }
      
      const numA = Number(aValue);
      const numB = Number(bValue);
      
      return sortDirection === 'asc' ? numA - numB : numB - numA;
    });
  }, [optionData, sortField, sortDirection]);

  const handleSortChange = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc'); // Default to descending for most fields
    }
  };

  const getSortLabel = (field: SortField): string => {
    const labels = {
      volume: 'Total Volume',
      premium: 'Total Premium',
      trades: 'Total Trades',
      recent: 'Recent Activity',
      sentiment: 'Sentiment',
      ticker: 'Ticker'
    };
    return labels[field];
  };

  if (loading) {
    return (
      <div className="trade-psychology-dashboard">
        <div className="dashboard-header">
          <div className="header-controls">
            <div className="header-title-group">
              <button 
                className="back-button"
                onClick={() => setActiveDashboard('options')}
                title="Back to Options Dashboard"
              >
                <ArrowLeft size={20} />
              </button>
              <h2>Overall Analysis</h2>
            </div>
            
            {/* Sort Controls - Full Width */}
            <div className="sort-controls">
              {(['volume', 'premium', 'trades', 'recent', 'sentiment', 'ticker'] as SortField[]).map((field) => (
                <button
                  key={field}
                  className={`sort-tab ${sortField === field ? 'active' : ''}`}
                  onClick={() => handleSortChange(field)}
                  title={`Sort by ${getSortLabel(field)}`}
                >
                  <span>{getSortLabel(field)}</span>
                  {sortField === field && (
                    <span className="sort-direction">
                      {sortDirection === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </button>
              ))}
            </div>
            
            <div className="header-actions">
              <button 
                className="refresh-button"
                onClick={handleRefresh}
                title="Refresh Data"
              >
                <RefreshCw size={20} />
              </button>
            </div>
          </div>
        </div>
        <div className="loading">
          <p>Loading overall analysis data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="trade-psychology-dashboard">
        <div className="dashboard-header">
          <div className="header-controls">
            <div className="header-title-group">
              <button 
                className="back-button"
                onClick={() => setActiveDashboard('options')}
                title="Back to Options Dashboard"
              >
                <ArrowLeft size={20} />
              </button>
              <h2>Overall Analysis</h2>
            </div>
            
            {/* Sort Controls - Full Width */}
            <div className="sort-controls">
              {(['volume', 'premium', 'trades', 'recent', 'sentiment', 'ticker'] as SortField[]).map((field) => (
                <button
                  key={field}
                  className={`sort-tab ${sortField === field ? 'active' : ''}`}
                  onClick={() => handleSortChange(field)}
                  title={`Sort by ${getSortLabel(field)}`}
                >
                  <span>{getSortLabel(field)}</span>
                  {sortField === field && (
                    <span className="sort-direction">
                      {sortDirection === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </button>
              ))}
            </div>
            
            <div className="header-actions">
              <button 
                className="refresh-button"
                onClick={handleRefresh}
                title="Refresh Data"
              >
                <RefreshCw size={20} />
              </button>
            </div>
          </div>
        </div>
        <div className="error">
          <div className="error-icon">
            <AlertTriangle size={48} />
          </div>
          <h3>Error Loading Data</h3>
          <p>{error}</p>
          <div className="error-actions">
            <button onClick={handleRefresh} className="retry-button">
              <RefreshCw size={16} />
              Try Again
            </button>
            <button onClick={handleClearCache} className="clear-cache-button">
              <AlertTriangle size={16} />
              Clear Cache & Reload
            </button>
          </div>
        </div>
      </div>
    );
  }



  return (
    <div className="trade-psychology-dashboard">
      <div className="dashboard-header">
        <div className="header-controls">
          <div className="header-title-group">
            <button 
              className="back-button"
              onClick={() => setActiveDashboard('options')}
              title="Back to Options Dashboard"
            >
              <ArrowLeft size={20} />
            </button>
            <h2>Overall Analysis</h2>
          </div>
          
          {/* Sort Controls - Full Width */}
          <div className="sort-controls">
            {(['volume', 'premium', 'trades', 'recent', 'sentiment', 'ticker'] as SortField[]).map((field) => (
              <button
                key={field}
                className={`sort-tab ${sortField === field ? 'active' : ''}`}
                onClick={() => handleSortChange(field)}
                title={`Sort by ${getSortLabel(field)}`}
              >
                <span>{getSortLabel(field)}</span>
                {sortField === field && (
                  <span className="sort-direction">
                    {sortDirection === 'asc' ? '↑' : '↓'}
                  </span>
                )}
              </button>
            ))}
          </div>
          
          <div className="header-actions">
            <button 
              className="refresh-button"
              onClick={handleRefresh}
              title="Refresh Data"
            >
              <RefreshCw size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* Ticker Weekly Analysis */}
      <TickerWeeklyAnalysisComponent 
        trades={optionData} 
        sortedAnalyses={sortedTickerAnalyses}
      />
    </div>
  );
};


export default OverallAnalysisDashboard;
