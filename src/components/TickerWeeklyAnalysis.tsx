import React, { useMemo } from 'react';
import { OptionData, formatPremium, isExpiryInCurrentWeek } from '../utils/dataParser';
import { 
  analyzeTickerWeeklySentiment, 
  TickerWeeklyAnalysis,
  WeeklyTickerData,
  analyzeFourDayTradePsychology
} from '../utils/tradePsychology';
import TickerDirectionCharts from './TickerDirectionCharts';

interface TickerWeeklyAnalysisProps {
  trades: OptionData[];
  sortedAnalyses?: TickerWeeklyAnalysis[];
}

const TickerWeeklyAnalysisComponent: React.FC<TickerWeeklyAnalysisProps> = ({ trades, sortedAnalyses }) => {
  const tickerAnalyses = useMemo(() => {
    // Use sorted analyses if provided, otherwise compute from trades
    if (sortedAnalyses) {
      return sortedAnalyses;
    }
    if (!trades || trades.length === 0) return [];
    return analyzeTickerWeeklySentiment(trades);
  }, [trades, sortedAnalyses]);

  if (tickerAnalyses.length === 0) {
    return (
      <div className="ticker-weekly-analysis">
        <h3>Ticker Weekly Analysis</h3>
        <p>No data available for ticker weekly analysis</p>
      </div>
    );
  }

  return (
    <div className="ticker-weekly-analysis">
      <h3>Ticker Weekly Analysis</h3>
      <p>Bullish/Bearish sentiment by ticker for each week</p>
      
      <div className="ticker-analysis-grid">
        {tickerAnalyses.slice(0, 20).map((analysis) => {
          const tickerTrades = trades.filter(t => t.ticker === analysis.ticker);
          return (
            <TickerAnalysisCard 
              key={analysis.ticker} 
              analysis={analysis} 
              trades={tickerTrades}
            />
          );
        })}
      </div>
    </div>
  );
};

interface TickerAnalysisCardProps {
  analysis: TickerWeeklyAnalysis;
  trades: OptionData[];
}

const TickerAnalysisCard: React.FC<TickerAnalysisCardProps> = ({ analysis, trades }) => {
  const totalVolume = analysis.weeks.reduce((sum, week) => sum + week.totalVolume, 0);
  const totalTrades = analysis.weeks.reduce((sum, week) => sum + week.totalTrades, 0);
  const totalPremium = analysis.weeks.reduce((sum, week) => sum + week.totalPremium, 0);

  // Calculate stock direction prediction for this ticker based on current week's expiry
  const { stockDirection, currentWeekTrades } = useMemo(() => {
    if (trades.length === 0) return { stockDirection: null, currentWeekTrades: [] };
    
    // Filter to only include options expiring in the current week
    const filtered = trades.filter(trade => isExpiryInCurrentWeek(trade.expiry));
    
    if (filtered.length === 0) return { stockDirection: null, currentWeekTrades: [] };
    
    const tickerAnalysis = analyzeFourDayTradePsychology(filtered);
    return { stockDirection: tickerAnalysis.stockDirection, currentWeekTrades: filtered };
  }, [trades]);

  return (
    <div className={`ticker-analysis-card ${analysis.overallSentiment}`}>
      <div className="ticker-header">
        <h4>{analysis.ticker}</h4>
        <div className={`overall-sentiment ${analysis.overallSentiment}`}>
          {analysis.overallSentiment.toUpperCase()}
        </div>
      </div>
      
      <div className="ticker-summary">
        <div className="summary-metric">
          <span className="metric-label">Volume</span>
          <span className="metric-value">{formatVolume(totalVolume)}</span>
        </div>
        <div className="summary-metric">
          <span className="metric-label">Trades</span>
          <span className="metric-value">{totalTrades.toLocaleString()}</span>
        </div>
        <div className="summary-metric">
          <span className="metric-label">Premium</span>
          <span className="metric-value">{formatPremium(totalPremium)}</span>
        </div>
        <div className="summary-metric">
          <span className="metric-label">Weeks</span>
          <span className="metric-value">{analysis.weeks.length}</span>
        </div>
      </div>

      {/* Stock Direction Prediction */}
      {stockDirection && (
        <div className="ticker-stock-direction">
          <div className={`ticker-prediction-card ${stockDirection.direction}`}>
            <div className="ticker-prediction-main">
              <div className="ticker-prediction-direction">
                <div className="ticker-direction-icon">
                  {stockDirection.direction === 'bullish' && '↗'}
                  {stockDirection.direction === 'bearish' && '↘'}
                  {stockDirection.direction === 'neutral' && '→'}
                  {stockDirection.direction === 'mixed' && '⇄'}
                </div>
                <div className="ticker-direction-label">
                  <span className="ticker-direction-text">{stockDirection.direction.toUpperCase()}</span>
                  <span className={`ticker-confidence-badge ${stockDirection.confidence}`}>
                    {stockDirection.confidence}
                  </span>
                </div>
              </div>
              <div className="ticker-strength-meter">
                <div className="ticker-strength-label">Strength</div>
                <div className="ticker-strength-bar">
                  <div 
                    className="ticker-strength-fill"
                    style={{ 
                      width: `${stockDirection.strength}%`,
                      background: stockDirection.direction === 'bullish' 
                        ? 'linear-gradient(90deg, #4caf50, #66bb6a)' 
                        : stockDirection.direction === 'bearish'
                        ? 'linear-gradient(90deg, #f44336, #ef5350)'
                        : 'linear-gradient(90deg, #9e9e9e, #bdbdbd)'
                    }}
                  ></div>
                </div>
                <div className="ticker-strength-value">{stockDirection.strength}%</div>
              </div>
            </div>

            {stockDirection.reasoning.length > 0 && (
              <div className="ticker-prediction-reasoning">
                <div className="ticker-reasoning-header">Key Indicators:</div>
                <ul className="ticker-reasoning-list">
                  {stockDirection.reasoning.slice(0, 3).map((reason, idx) => (
                    <li key={idx}>{reason}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Charts */}
            {stockDirection && currentWeekTrades.length > 0 && (
              <TickerDirectionCharts 
                trades={currentWeekTrades}
                prediction={stockDirection}
              />
            )}
          </div>
        </div>
      )}

      <div className="trend-info">
        <div className={`trend-direction ${analysis.trendDirection}`}>
          <span className="trend-label">Trend</span>
          <span className="trend-value">{analysis.trendDirection}</span>
        </div>
        <div className={`confidence ${analysis.confidence}`}>
          <span className="confidence-label">Confidence</span>
          <span className="confidence-value">{analysis.confidence}</span>
        </div>
      </div>

      <div className="weekly-breakdown">
        <div className="weeks-list">
          {analysis.weeks.slice(0, 2).map((week) => (
            <WeekRow key={`${week.weekStart}-${week.weekEnd}`} week={week} />
          ))}
        </div>
      </div>
    </div>
  );
};

interface WeekRowProps {
  week: WeeklyTickerData;
}

const WeekRow: React.FC<WeekRowProps> = ({ week }) => {
  const weekLabel = `${formatWeekDate(week.weekStart)} - ${formatWeekDate(week.weekEnd)}`;
  
  return (
    <div className={`week-row ${week.psychology.sentiment}`}>
      <div className="week-header">
        <span className="week-date">{weekLabel}</span>
        <div className={`week-sentiment ${week.psychology.sentiment}`}>
          {week.psychology.sentiment.toUpperCase()}
        </div>
      </div>
      
      <div className="week-metrics">
        <div className="week-metric">
          <span className="metric-label">Vol</span>
          <span className="metric-value">{formatVolume(week.totalVolume)}</span>
        </div>
        <div className="week-metric">
          <span className="metric-label">C/P</span>
          <span className="metric-value">{week.callPutRatio.toFixed(1)}</span>
        </div>
        <div className="week-metric">
          <span className="metric-label">Trd</span>
          <span className="metric-value">{week.totalTrades}</span>
        </div>
        <div className="week-metric">
          <span className="metric-label">Swp</span>
          <span className="metric-value">{week.sweepCount + week.unusualSweepCount + week.highlyUnusualSweepCount}</span>
        </div>
      </div>
      
      <div className="week-psychology">
        <span className="psychology-description">{week.psychology.description}</span>
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

function formatWeekDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric' 
  });
}

export default TickerWeeklyAnalysisComponent;
