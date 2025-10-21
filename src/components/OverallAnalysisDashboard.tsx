import React, { useState, useEffect } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { 
  mergeDataFromFiles,
  clearDataCache,
  OptionData,
  MergedDataInfo
} from '../utils/dataParser';
import { loadAllDataFiles } from '../utils/fileLoader';
import TickerWeeklyAnalysisComponent from './TickerWeeklyAnalysis';

type DashboardType = 'options' | 'darkpool' | 'psychology';

interface OverallAnalysisDashboardProps {
  activeDashboard: DashboardType;
  setActiveDashboard: (dashboard: DashboardType) => void;
}

const OverallAnalysisDashboard: React.FC<OverallAnalysisDashboardProps> = ({ setActiveDashboard }) => {
  const [optionData, setOptionData] = useState<OptionData[]>([]);
  const [, setDataInfo] = useState<MergedDataInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
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
          <button 
            className="refresh-button"
            onClick={handleRefresh}
            title="Refresh Data"
          >
            <RefreshCw size={20} />
          </button>
        </div>
      </div>

      {/* Ticker Weekly Analysis */}
      <TickerWeeklyAnalysisComponent trades={optionData} />
    </div>
  );
};


export default OverallAnalysisDashboard;
