import React, { useMemo, useState, useEffect } from 'react';
import { ArrowLeft, Calendar, RefreshCw } from 'lucide-react';
import { 
  mergeDataFromFiles,
  clearDataCache,
  OptionData,
  MergedDataInfo
} from '../utils/dataParser';
import { loadAllDataFiles, clearFileCache } from '../utils/fileLoader';
import { 
  analyzeFourDayTradePsychology, 
  FourDayPsychologyAnalysis, 
  DailyTradePsychology,
  HourlyTradeData 
} from '../utils/tradePsychology';

type DashboardType = 'options' | 'darkpool' | 'psychology';

interface TradePsychologyDashboardProps {
  activeDashboard: DashboardType;
  setActiveDashboard: (dashboard: DashboardType) => void;
}

const TradePsychologyDashboard: React.FC<TradePsychologyDashboardProps> = ({ activeDashboard, setActiveDashboard }) => {
  const [selectedDay, setSelectedDay] = useState<number>(0);
  const [optionData, setOptionData] = useState<OptionData[]>([]);
  const [dataInfo, setDataInfo] = useState<MergedDataInfo | null>(null);
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
  
  const analysis = useMemo(() => {
    if (!optionData || optionData.length === 0) return null;
    return analyzeFourDayTradePsychology(optionData);
  }, [optionData]);

  const handleRefresh = async () => {
    clearDataCache();
    clearFileCache();
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
            <h2>Trade Psychology Analysis</h2>
            <button 
              className="refresh-button"
              onClick={handleRefresh}
              title="Refresh Data"
            >
              <RefreshCw size={20} />
            </button>
          </div>
          <p>5-Day Trading Psychology Analysis</p>
        </div>
        <div className="loading">
          <p>Loading trade psychology data...</p>
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
            <h2>Trade Psychology Analysis</h2>
            <button 
              className="refresh-button"
              onClick={handleRefresh}
              title="Refresh Data"
            >
              <RefreshCw size={20} />
            </button>
          </div>
          <p>5-Day Trading Psychology Analysis</p>
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

  if (!analysis || analysis.days.length === 0) {
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
            <h2>Trade Psychology Analysis</h2>
            <button 
              className="refresh-button"
              onClick={handleRefresh}
              title="Refresh Data"
            >
              <RefreshCw size={20} />
            </button>
          </div>
          <p>5-Day Trading Psychology Analysis</p>
        </div>
        <div className="no-data">
          <p>No trade data available for analysis</p>
          <button onClick={handleRefresh} className="retry-button">
            Refresh Data
          </button>
        </div>
      </div>
    );
  }

  const selectedDayData = analysis.days[selectedDay];

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
          <h2>Trade Psychology Analysis</h2>
          <button 
            className="refresh-button"
            onClick={handleRefresh}
            title="Refresh Data"
          >
            <RefreshCw size={20} />
          </button>
        </div>
        <p>5-Day Trading Psychology Analysis</p>
        <div className="overall-trend">
          <div className={`trend-indicator ${analysis.overallTrend.sentiment}`}>
            <span className="trend-sentiment">{analysis.overallTrend.sentiment.toUpperCase()}</span>
            <span className="trend-confidence">{analysis.overallTrend.confidence} confidence</span>
          </div>
          <p className="trend-description">{analysis.overallTrend.description}</p>
        </div>
      </div>

      <div className="four-day-layout">
        {analysis.days.map((day, index) => (
          <DayColumn
            key={day.date}
            day={day}
            isSelected={index === selectedDay}
            onClick={() => setSelectedDay(index)}
            index={index}
          />
        ))}
      </div>

      <div className="detailed-analysis">
        <div className="day-selector">
          <h3>Detailed Analysis: {selectedDayData.dayOfWeek}, {selectedDayData.date}</h3>
          <div className="day-summary">
            <div className="summary-metrics">
              <div className="metric">
                <span className="metric-label">Total Volume</span>
                <span className="metric-value">{formatVolume(selectedDayData.dailySummary.totalVolume)}</span>
              </div>
              <div className="metric">
                <span className="metric-label">Total Trades</span>
                <span className="metric-value">{selectedDayData.dailySummary.totalTrades.toLocaleString()}</span>
              </div>
              <div className="metric">
                <span className="metric-label">Call/Put Ratio</span>
                <span className="metric-value">{selectedDayData.dailySummary.callPutRatio.toFixed(2)}:1</span>
              </div>
              <div className="metric">
                <span className="metric-label">Peak Hour</span>
                <span className="metric-value">{formatHour(selectedDayData.dailySummary.peakHour)}</span>
              </div>
            </div>
            <div className="psychology-summary">
              <div className={`psychology-indicator ${selectedDayData.dailySummary.psychology.sentiment}`}>
                <span className="psychology-sentiment">{selectedDayData.dailySummary.psychology.sentiment.toUpperCase()}</span>
                <span className="psychology-confidence">{selectedDayData.dailySummary.psychology.confidence} confidence</span>
              </div>
              <p className="psychology-description">{selectedDayData.dailySummary.psychology.description}</p>
            </div>
          </div>
        </div>

        <div className="hourly-chart">
          <h4>Hourly Breakdown</h4>
          <div className="chart-container">
            <div className="chart-grid">
              {selectedDayData.hourlyData.map((hourData) => (
                <HourBar
                  key={hourData.hour}
                  hourData={hourData}
                  maxVolume={Math.max(...selectedDayData.hourlyData.map(h => h.totalVolume))}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface DayColumnProps {
  day: DailyTradePsychology;
  isSelected: boolean;
  onClick: () => void;
  index: number;
}

const DayColumn: React.FC<DayColumnProps> = ({ day, isSelected, onClick, index }) => {
  // Get the actual date from the day data
  const dayDate = new Date(day.date);
  const today = new Date();
  const diffTime = today.getTime() - dayDate.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  // Create appropriate labels based on the actual date difference
  const getDayLabel = (index: number, diffDays: number) => {
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays === 2) return '2 Days Ago';
    if (diffDays === 3) return '3 Days Ago';
    if (diffDays === 4) return '4 Days Ago';
    if (diffDays === 5) return '5 Days Ago';
    return `${diffDays} Days Ago`;
  };
  
  return (
    <div 
      className={`day-column ${isSelected ? 'selected' : ''}`}
      onClick={onClick}
    >
      <div className="day-header">
        <h4>{getDayLabel(index, diffDays)}</h4>
        <p className="day-date">{day.dayOfWeek}</p>
        <p className="day-date-short">{day.date}</p>
      </div>
      
      <div className="day-metrics">
        <div className="metric-row">
          <span className="metric-label">Volume</span>
          <span className="metric-value">{formatVolume(day.dailySummary.totalVolume)}</span>
        </div>
        <div className="metric-row">
          <span className="metric-label">Trades</span>
          <span className="metric-value">{day.dailySummary.totalTrades}</span>
        </div>
        <div className="metric-row">
          <span className="metric-label">C/P Ratio</span>
          <span className="metric-value">{day.dailySummary.callPutRatio.toFixed(1)}</span>
        </div>
        <div className="metric-row">
          <span className="metric-label">Sweeps</span>
          <span className="metric-value">{day.dailySummary.sweepCount}</span>
        </div>
      </div>
      
      <div className={`psychology-indicator ${day.dailySummary.psychology.sentiment}`}>
        <span className="psychology-sentiment">{day.dailySummary.psychology.sentiment.toUpperCase()}</span>
        <span className="psychology-confidence">{day.dailySummary.psychology.confidence}</span>
      </div>
      
      <div className="mini-chart">
        {day.hourlyData.map((hourData) => (
          <div
            key={hourData.hour}
            className={`mini-hour-bar ${hourData.psychology.sentiment}`}
            style={{
              height: `${Math.max(2, (hourData.totalVolume / Math.max(...day.hourlyData.map(h => h.totalVolume))) * 100)}%`
            }}
            title={`${formatHour(hourData.hour)}: ${formatVolume(hourData.totalVolume)} volume, ${hourData.psychology.sentiment} sentiment`}
          />
        ))}
      </div>
    </div>
  );
};

interface HourBarProps {
  hourData: HourlyTradeData;
  maxVolume: number;
}

const HourBar: React.FC<HourBarProps> = ({ hourData, maxVolume }) => {
  const height = maxVolume > 0 ? (hourData.totalVolume / maxVolume) * 100 : 0;
  
  return (
    <div className="hour-bar-container">
      <div className="hour-label">{formatHour(hourData.hour)}</div>
      <div className="hour-bar-wrapper">
        <div
          className={`hour-bar ${hourData.psychology.sentiment} ${hourData.psychology.activity}`}
          style={{ height: `${Math.max(5, height)}%` }}
        >
          <div className="bar-content">
            <div className="volume-info">
              <span className="volume">{formatVolume(hourData.totalVolume)}</span>
              <span className="trades">{hourData.totalTrades}</span>
            </div>
            <div className="psychology-info">
              <span className="sentiment">{hourData.psychology.sentiment}</span>
              {hourData.psychology.sweepIntensity !== 'low' && (
                <span className="sweep-intensity">{hourData.psychology.sweepIntensity} sweeps</span>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="hour-details">
        <div className="cp-ratio">C/P: {hourData.callPutRatio.toFixed(1)}</div>
        <div className="sweep-count">{hourData.sweepCount + hourData.unusualSweepCount + hourData.highlyUnusualSweepCount} sweeps</div>
      </div>
    </div>
  );
};

// Utility functions
function formatVolume(volume: number): string {
  if (volume >= 1000000) {
    return `${(volume / 1000000).toFixed(1)}M`;
  } else if (volume >= 1000) {
    return `${(volume / 1000).toFixed(1)}K`;
  }
  return volume.toString();
}

function formatHour(hour: number): string {
  // Handle decimal hours (e.g., 9.5 = 9:30 AM)
  const isHalfHour = hour % 1 === 0.5;
  const wholeHour = Math.floor(hour);
  
  if (wholeHour === 0) return isHalfHour ? '12:30AM' : '12AM';
  if (wholeHour < 12) return isHalfHour ? `${wholeHour}:30AM` : `${wholeHour}AM`;
  if (wholeHour === 12) return isHalfHour ? '12:30PM' : '12PM';
  return isHalfHour ? `${wholeHour - 12}:30PM` : `${wholeHour - 12}PM`;
}

export default TradePsychologyDashboard;
