import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ArrowLeft, RefreshCw, ChevronDown, ArrowUpDown } from 'lucide-react';
import { 
  mergeDataFromFiles,
  clearDataCache,
  OptionData,
  MergedDataInfo
} from '../utils/dataParser';
import { loadAllDataFiles } from '../utils/fileLoader';
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
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const sortDropdownRef = useRef<HTMLDivElement>(null);
  
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
        const { mergedData, info } = mergeDataFromFiles(loadedFiles);
        
        setOptionData(mergedData);
        setDataInfo(info);
        
        if (import.meta.env.DEV) {
          console.log(`Loaded ${mergedData.length} option records from ${info.totalFiles} files`);
          console.log('Date range:', info.dateRange);
        }
      } catch (err) {
        console.error('Error loading data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    // Load data on mount
    loadAllData();
  }, []);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(event.target as Node)) {
        setShowSortDropdown(false);
      }
    };

    if (showSortDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showSortDropdown]);
  

  const handleRefresh = async () => {
    clearDataCache();
    const loadAllData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const loadedFiles = await loadAllDataFiles(true);
        
        if (loadedFiles.length === 0) {
          throw new Error('No data files found in the data directory');
        }
        
        const { mergedData, info } = mergeDataFromFiles(loadedFiles);
        
        setOptionData(mergedData);
        setDataInfo(info);
        
        if (import.meta.env.DEV) {
          console.log(`Refreshed: Loaded ${mergedData.length} option records from ${info.totalFiles} files`);
        }
      } catch (err) {
        console.error('Error refreshing data:', err);
        setError(err instanceof Error ? err.message : 'Failed to refresh data');
      } finally {
        setLoading(false);
      }
    };
    
    await loadAllData();
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
    setShowSortDropdown(false);
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
            <button 
              className="back-button"
              onClick={() => setActiveDashboard('options')}
              title="Back to Options Dashboard"
            >
              <ArrowLeft size={20} />
            </button>
            <h2>Overall Analysis</h2>
            <button 
              className="refresh-button"
              onClick={handleRefresh}
              title="Refresh Data"
            >
              <RefreshCw size={20} />
            </button>
          </div>
          {/* <p>5-Day Overall Market Analysis</p> */}
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
            <button 
              className="back-button"
              onClick={() => setActiveDashboard('options')}
              title="Back to Options Dashboard"
            >
              <ArrowLeft size={20} />
            </button>
            <h2>Overall Analysis</h2>
            <button 
              className="refresh-button"
              onClick={handleRefresh}
              title="Refresh Data"
            >
              <RefreshCw size={20} />
            </button>
          </div>
          <p>5-Day Overall Market Analysis</p>
        </div>
        <div className="error">
          <p>Error: {error}</p>
          <button onClick={handleRefresh} className="retry-button">
            Try Again
          </button>
        </div>
      </div>
    );
  }



  return (
    <div className="trade-psychology-dashboard">
      <div className="dashboard-header">
        <div className="header-controls">
          <button 
            className="back-button"
            onClick={() => setActiveDashboard('options')}
            title="Back to Options Dashboard"
          >
            <ArrowLeft size={20} />
          </button>
          <h2>Overall Analysis</h2>
          <div className="header-actions">
            {/* Sort Controls */}
            <div className="sort-controls" ref={sortDropdownRef}>
              <button 
                className="sort-button"
                onClick={() => setShowSortDropdown(!showSortDropdown)}
                title="Sort Options"
              >
                <ArrowUpDown size={16} />
                <span>Sort: {getSortLabel(sortField)}</span>
                <ChevronDown size={14} className={showSortDropdown ? 'rotated' : ''} />
              </button>
              
              {showSortDropdown && (
                <div className="sort-dropdown" style={{ display: 'block' }}>
                  {(['volume', 'premium', 'trades', 'recent', 'sentiment', 'ticker'] as SortField[]).map((field) => (
                    <button
                      key={field}
                      className={`sort-option ${sortField === field ? 'active' : ''}`}
                      onClick={() => handleSortChange(field)}
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
              )}
            </div>
            
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
