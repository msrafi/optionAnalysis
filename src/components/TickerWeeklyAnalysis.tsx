import React, { useMemo } from 'react';
import { OptionData, formatPremium } from '../utils/dataParser';
import { 
  analyzeTickerWeeklySentiment, 
  TickerWeeklyAnalysis,
  WeeklyTickerData 
} from '../utils/tradePsychology';

interface TickerWeeklyAnalysisProps {
  trades: OptionData[];
}

const TickerWeeklyAnalysisComponent: React.FC<TickerWeeklyAnalysisProps> = ({ trades }) => {
  const tickerAnalyses = useMemo(() => {
    if (!trades || trades.length === 0) return [];
    return analyzeTickerWeeklySentiment(trades);
  }, [trades]);

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
        {tickerAnalyses.slice(0, 20).map((analysis) => (
          <TickerAnalysisCard key={analysis.ticker} analysis={analysis} />
        ))}
      </div>
    </div>
  );
};

interface TickerAnalysisCardProps {
  analysis: TickerWeeklyAnalysis;
}

const TickerAnalysisCard: React.FC<TickerAnalysisCardProps> = ({ analysis }) => {
  const totalVolume = analysis.weeks.reduce((sum, week) => sum + week.totalVolume, 0);
  const totalTrades = analysis.weeks.reduce((sum, week) => sum + week.totalTrades, 0);
  const totalPremium = analysis.weeks.reduce((sum, week) => sum + week.totalPremium, 0);

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
          <span className="metric-label">Total Volume</span>
          <span className="metric-value">{formatVolume(totalVolume)}</span>
        </div>
        <div className="summary-metric">
          <span className="metric-label">Total Trades</span>
          <span className="metric-value">{totalTrades.toLocaleString()}</span>
        </div>
        <div className="summary-metric">
          <span className="metric-label">Total Premium</span>
          <span className="metric-value">{formatPremium(totalPremium)}</span>
        </div>
        <div className="summary-metric">
          <span className="metric-label">Weeks</span>
          <span className="metric-value">{analysis.weeks.length}</span>
        </div>
      </div>

      <div className="trend-info">
        <div className={`trend-direction ${analysis.trendDirection}`}>
          <span className="trend-label">Trend:</span>
          <span className="trend-value">{analysis.trendDirection}</span>
        </div>
        <div className={`confidence ${analysis.confidence}`}>
          <span className="confidence-label">Confidence:</span>
          <span className="confidence-value">{analysis.confidence}</span>
        </div>
      </div>

      <div className="weekly-breakdown">
        <h5>Weekly Breakdown</h5>
        <div className="weeks-list">
          {analysis.weeks.slice(0, 4).map((week) => (
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
          <span className="metric-label">Volume</span>
          <span className="metric-value">{formatVolume(week.totalVolume)}</span>
        </div>
        <div className="week-metric">
          <span className="metric-label">C/P Ratio</span>
          <span className="metric-value">{week.callPutRatio.toFixed(1)}</span>
        </div>
        <div className="week-metric">
          <span className="metric-label">Trades</span>
          <span className="metric-value">{week.totalTrades}</span>
        </div>
        <div className="week-metric">
          <span className="metric-label">Sweeps</span>
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
