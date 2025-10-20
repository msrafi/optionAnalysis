import React, { useMemo, useState } from 'react';
import { OptionData } from '../utils/dataParser';
import { 
  analyzeFourDayTradePsychology, 
  FourDayPsychologyAnalysis, 
  DailyTradePsychology,
  HourlyTradeData 
} from '../utils/tradePsychology';

interface TickerPsychologyAnalysisProps {
  ticker: string;
  trades: OptionData[];
}

const TickerPsychologyAnalysis: React.FC<TickerPsychologyAnalysisProps> = ({ ticker, trades }) => {
  const [selectedDay, setSelectedDay] = useState<number>(0);
  
  const analysis = useMemo(() => {
    if (!trades || trades.length === 0) return null;
    return analyzeFourDayTradePsychology(trades);
  }, [trades]);

  if (!analysis || analysis.days.length === 0) {
    return (
      <div className="ticker-psychology-analysis">
        <div className="psychology-header">
          <h3>{ticker} Trade Psychology</h3>
          <p>5-Day Trading Psychology Analysis</p>
        </div>
        <div className="no-data">
          <p>No trade data available for {ticker} psychology analysis</p>
        </div>
      </div>
    );
  }

  const selectedDayData = analysis.days[selectedDay];

  return (
    <div className="ticker-psychology-analysis">
      <div className="psychology-header">
        <h3>{ticker} Trade Psychology</h3>
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
          <h4>Detailed Analysis: {selectedDayData.dayOfWeek}, {selectedDayData.date}</h4>
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
  const dayLabels = ['5 Days Ago', '4 Days Ago', '3 Days Ago', '2 Days Ago', 'Yesterday'];
  
  return (
    <div 
      className={`day-column ${isSelected ? 'selected' : ''}`}
      onClick={onClick}
    >
      <div className="day-header">
        <h4>{dayLabels[index]}</h4>
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

export default TickerPsychologyAnalysis;
