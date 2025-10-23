import React, { useMemo, useState } from 'react';
import { OptionData, formatPremium, parseTimestampFromData, parsePremium } from '../utils/dataParser';
import { 
  analyzeFourDayTradePsychology, 
  DailyTradePsychology,
  HourlyTradeData 
} from '../utils/tradePsychology';

interface TickerPsychologyAnalysisProps {
  ticker: string;
  trades: OptionData[];
}

const TickerPsychologyAnalysis: React.FC<TickerPsychologyAnalysisProps> = ({ ticker, trades }) => {
  const [selectedDay, setSelectedDay] = useState<number>(0);
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
  
  const analysis = useMemo(() => {
    if (!trades || trades.length === 0) return null;
    return analyzeFourDayTradePsychology(trades);
  }, [trades]);

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

      <div className="hourly-chart">
        <h4>Hourly Breakdown: {selectedDayData.dayOfWeek}, {selectedDayData.date}</h4>
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
            <div className="tooltip-section">
              <div className="tooltip-section-title">Summary</div>
              <div className="tooltip-row">
                <span className="tooltip-label">Total Volume</span>
                <span className="tooltip-value">{formatVolume(tooltip.content.totalVolume)}</span>
              </div>
              <div className="tooltip-row">
                <span className="tooltip-label">Total Trades</span>
                <span className="tooltip-value">{tooltip.content.totalTrades}</span>
              </div>
              <div className="tooltip-row">
                <span className="tooltip-label">Call/Put Ratio</span>
                <span className="tooltip-value">{tooltip.content.callPutRatio.toFixed(2)}:1</span>
              </div>
              <div className="tooltip-row">
                <span className="tooltip-label">Total Premium</span>
                <span className="tooltip-value">{formatPremium(tooltip.content.totalPremium)}</span>
              </div>
            </div>
            
            {tooltip.content.trades && tooltip.content.trades.length > 0 && (
              <div className="tooltip-section">
                <div className="tooltip-section-title">Individual Trades</div>
                <div className="trades-list">
                  {tooltip.content.trades.slice(0, 5).map((trade, index) => (
                    <div key={index} className={`trade-item ${trade.optionType.toLowerCase()}-trade`}>
                      <div className="trade-header">
                        <span className={`trade-type ${trade.optionType.toLowerCase()}`}>{trade.optionType}</span>
                        <span className="trade-strike">${trade.strike}</span>
                        <span className="trade-expiry">{new Date(trade.expiry).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                      </div>
                      <div className="trade-details">
                        <span className="trade-volume">Vol: {trade.volume}</span>
                        <span className="trade-premium">Premium: {formatPremium(parsePremium(trade.premium))}</span>
                        {trade.sweepType && (
                          <span className="trade-sweep">{trade.sweepType}</span>
                        )}
                      </div>
                      <div className="trade-time">
                        {new Date(parseTimestampFromData(trade.timestamp) || trade.timestamp).toLocaleTimeString('en-US', { 
                          hour: 'numeric', 
                          minute: '2-digit',
                          hour12: true 
                        })}
                      </div>
                    </div>
                  ))}
                  {tooltip.content.trades.length > 5 && (
                    <div className="more-trades">
                      +{tooltip.content.trades.length - 5} more trades
                    </div>
                  )}
                </div>
              </div>
            )}
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

export default TickerPsychologyAnalysis;
