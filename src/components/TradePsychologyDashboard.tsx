import React, { useMemo, useState, useEffect } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { 
  mergeDataFromFiles,
  clearDataCache,
  OptionData,
  MergedDataInfo,
  formatPremium
} from '../utils/dataParser';
import { loadAllDataFiles } from '../utils/fileLoader';
import { 
  analyzeFourDayTradePsychology, 
  DailyTradePsychology,
  HourlyTradeData 
} from '../utils/tradePsychology';

type DashboardType = 'options' | 'darkpool' | 'psychology';

interface TradePsychologyDashboardProps {
  activeDashboard: DashboardType;
  setActiveDashboard: (dashboard: DashboardType) => void;
}

const TradePsychologyDashboard: React.FC<TradePsychologyDashboardProps> = ({ setActiveDashboard }) => {
  const [selectedDay, setSelectedDay] = useState<number>(0);
  const [optionData, setOptionData] = useState<OptionData[]>([]);
  const [, setDataInfo] = useState<MergedDataInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{
    visible: boolean;
    x: number;
    y: number;
    content: HourlyTradeData | null;
  }>({
    visible: false,
    x: 0,
    y: 0,
    content: null
  });
  
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

  const handleBarMouseEnter = (event: React.MouseEvent, hourData: HourlyTradeData) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setTooltip({
      visible: true,
      x: rect.left + rect.width / 2,
      y: rect.top,
      content: hourData
    });
  };

  const handleBarMouseLeave = () => {
    setTooltip(prev => ({ ...prev, visible: false }));
  };

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
                <span className="metric-label">Total Premium</span>
                <span className="metric-value">{formatPremium(selectedDayData.dailySummary.totalPremium)}</span>
              </div>
              <div className="metric">
                <span className="metric-label">Call/Put Ratio</span>
                <span className="metric-value">{selectedDayData.dailySummary.callPutRatio.toFixed(2)}:1</span>
              </div>
              <div className="metric">
                <span className="metric-label">Peak Hour</span>
                <span className="metric-value">{formatHour(selectedDayData.dailySummary.peakHour)}</span>
              </div>
              <div className="metric">
                <span className="metric-label">Expiries</span>
                <span className="metric-value">{selectedDayData.dailySummary.uniqueExpiries.length}</span>
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
                  onMouseEnter={(e) => handleBarMouseEnter(e, hourData)}
                  onMouseLeave={handleBarMouseLeave}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Modern Tooltip */}
      {tooltip.visible && tooltip.content && (
        <div 
          className="modern-tooltip"
          style={{
            position: 'fixed',
            left: `${tooltip.x + 15}px`,
            top: `${tooltip.y}px`,
            transform: 'translateY(-50%)',
            pointerEvents: 'auto',
            zIndex: 9999
          }}
          onMouseEnter={() => setTooltip(prev => ({ ...prev, visible: true }))}
          onMouseLeave={handleBarMouseLeave}
        >
          <div className="tooltip-header">
            <span className="tooltip-strike">{formatHour(tooltip.content.hour)}</span>
            <span className={`tooltip-type ${tooltip.content.psychology.sentiment}`}>
              {tooltip.content.psychology.sentiment.toUpperCase()}
            </span>
          </div>
          <div className="tooltip-body">
            <div className="tooltip-row">
              <span className="tooltip-label">Total Volume</span>
              <span className="tooltip-value">{formatVolume(tooltip.content.totalVolume)}</span>
            </div>
            <div className="tooltip-row">
              <span className="tooltip-label">Total Trades</span>
              <span className="tooltip-value">{tooltip.content.totalTrades}</span>
            </div>
            <div className="tooltip-row">
              <span className="tooltip-label">Call Volume</span>
              <span className="tooltip-value">{formatVolume(tooltip.content.callVolume)}</span>
            </div>
            <div className="tooltip-row">
              <span className="tooltip-label">Put Volume</span>
              <span className="tooltip-value">{formatVolume(tooltip.content.putVolume)}</span>
            </div>
            <div className="tooltip-row">
              <span className="tooltip-label">Call/Put Ratio</span>
              <span className="tooltip-value">{tooltip.content.callPutRatio.toFixed(2)}:1</span>
            </div>
            <div className="tooltip-row">
              <span className="tooltip-label">Call Trades</span>
              <span className="tooltip-value">{tooltip.content.callTrades}</span>
            </div>
            <div className="tooltip-row">
              <span className="tooltip-label">Put Trades</span>
              <span className="tooltip-value">{tooltip.content.putTrades}</span>
            </div>
            <div className="tooltip-row">
              <span className="tooltip-label">Total Premium</span>
              <span className="tooltip-value">${tooltip.content.totalPremium.toLocaleString()}</span>
            </div>
            <div className="tooltip-row">
              <span className="tooltip-label">Call Premium</span>
              <span className="tooltip-value">${tooltip.content.callPremium.toLocaleString()}</span>
            </div>
            <div className="tooltip-row">
              <span className="tooltip-label">Put Premium</span>
              <span className="tooltip-value">${tooltip.content.putPremium.toLocaleString()}</span>
            </div>
            <div className="tooltip-row">
              <span className="tooltip-label">Avg Trade Size</span>
              <span className="tooltip-value">{formatVolume(tooltip.content.avgTradeSize)}</span>
            </div>
            <div className="tooltip-row">
              <span className="tooltip-label">Regular Sweeps</span>
              <span className="tooltip-value">{tooltip.content.sweepCount}</span>
            </div>
            <div className="tooltip-row">
              <span className="tooltip-label">Unusual Sweeps</span>
              <span className="tooltip-value">{tooltip.content.unusualSweepCount}</span>
            </div>
            <div className="tooltip-row">
              <span className="tooltip-label">Highly Unusual Sweeps</span>
              <span className="tooltip-value">{tooltip.content.highlyUnusualSweepCount}</span>
            </div>
            <div className="tooltip-row">
              <span className="tooltip-label">Total Sweeps</span>
              <span className="tooltip-value">{tooltip.content.sweepCount + tooltip.content.unusualSweepCount + tooltip.content.highlyUnusualSweepCount}</span>
            </div>
            <div className="tooltip-row">
              <span className="tooltip-label">Confidence</span>
              <span className="tooltip-value">{tooltip.content.psychology.confidence}</span>
            </div>
            <div className="tooltip-row">
              <span className="tooltip-label">Activity</span>
              <span className="tooltip-value">{tooltip.content.psychology.activity}</span>
            </div>
            <div className="tooltip-row">
              <span className="tooltip-label">Sweep Intensity</span>
              <span className="tooltip-value">{tooltip.content.psychology.sweepIntensity}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface DayColumnProps {
  day: DailyTradePsychology;
  isSelected: boolean;
  onClick: () => void;
  index: number;
}

const DayColumn: React.FC<DayColumnProps> = ({ day, isSelected, onClick }) => {
  return (
    <div 
      className={`day-column ${isSelected ? 'selected' : ''}`}
      onClick={onClick}
    >
      <div className="day-header">
        <h4>{day.dayOfWeek}</h4>
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
        <div className="metric-row">
          <span className="metric-label">Premium</span>
          <span className="metric-value">{formatPremium(day.dailySummary.totalPremium)}</span>
        </div>
        <div className="metric-row">
          <span className="metric-label">Expiries</span>
          <span className="metric-value">{day.dailySummary.uniqueExpiries.length}</span>
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
  onMouseEnter: (event: React.MouseEvent) => void;
  onMouseLeave: () => void;
}

const HourBar: React.FC<HourBarProps> = ({ hourData, maxVolume, onMouseEnter, onMouseLeave }) => {
  const height = maxVolume > 0 ? (hourData.totalVolume / maxVolume) * 100 : 0;
  const hasTrades = hourData.totalVolume > 0;
  
  return (
    <div className="hour-bar-container">
      <div className="hour-label">{formatHour(hourData.hour)}</div>
      <div className="hour-bar-wrapper">
        <div
          className={`hour-bar ${hasTrades ? `${hourData.psychology.sentiment} ${hourData.psychology.activity}` : 'no-trades'}`}
          style={hasTrades ? { height: `${Math.max(5, height)}%` } : {}}
          onMouseEnter={hasTrades ? onMouseEnter : undefined}
          onMouseLeave={hasTrades ? onMouseLeave : undefined}
        >
          <div className="bar-content">
            <div className="volume-info">
              <span className="volume">{formatVolume(hourData.totalVolume)}</span>
              <span className="trades">{hourData.totalTrades}</span>
            </div>
            <div className="call-put-info">
              <span className="call-volume">C: {formatVolume(hourData.callVolume)}</span>
              <span className="put-volume">P: {formatVolume(hourData.putVolume)}</span>
            </div>
          </div>
        </div>
      </div>
      <div className="hour-details">
        <div className="cp-ratio">C/P: {hourData.callPutRatio.toFixed(1)}</div>
        <div className="volume-breakdown">C: {formatVolume(hourData.callVolume)} | P: {formatVolume(hourData.putVolume)}</div>
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
