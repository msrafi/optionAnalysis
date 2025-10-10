import React, { memo, useMemo, useCallback } from 'react';
import { TrendingUp, TrendingDown, Calendar, DollarSign, Clock } from 'lucide-react';
import { TickerSummary, formatVolume, formatPremium } from '../utils/dataParser';

interface TickerListProps {
  tickers: TickerSummary[];
  onTickerSelect: (ticker: string) => void;
}

const getTimeAgo = (timestamp: string): string => {
  try {
    const now = new Date();
    const time = new Date(timestamp);
    
    // Check if the date is valid
    if (isNaN(time.getTime())) {
      return 'Unknown';
    }
    
    const diffInHours = Math.floor((now.getTime() - time.getTime()) / (1000 * 60 * 60));
    
    if (diffInHours < 1) {
      return 'Just now';
    } else if (diffInHours < 24) {
      return `${diffInHours}h ago`;
    } else {
      const diffInDays = Math.floor(diffInHours / 24);
      return `${diffInDays}d ago`;
    }
  } catch (error) {
    console.warn('Error parsing timestamp:', timestamp, error);
    return 'Unknown';
  }
};

const TickerList: React.FC<TickerListProps> = memo(({ tickers, onTickerSelect }) => {
  return (
    <div className="ticker-list">
      <div className="ticker-list-header">
        <h2>Options Volume Dashboard</h2>
        <p>Sorted by most recent trading activity • Click on any ticker to view detailed volume profile</p>
      </div>
      
      <div className="ticker-grid">
        {tickers.map((ticker) => (
          <div 
            key={ticker.ticker} 
            className="ticker-card"
            onClick={() => onTickerSelect(ticker.ticker)}
          >
            <div className="ticker-header">
              <h3 className="ticker-symbol">{ticker.ticker}</h3>
              <div className="ticker-metrics">
                <div className="metric">
                  <TrendingUp className="metric-icon call" />
                  <span className="metric-label">Calls</span>
                  <span className="metric-value">{formatVolume(ticker.callVolume)}</span>
                </div>
                <div className="metric">
                  <TrendingDown className="metric-icon put" />
                  <span className="metric-label">Puts</span>
                  <span className="metric-value">{formatVolume(ticker.putVolume)}</span>
                </div>
              </div>
            </div>
            
            <div className="ticker-details">
              <div className="detail-row">
                <span className="detail-label">Total Volume:</span>
                <span className="detail-value">{formatVolume(ticker.totalVolume)}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Total Premium:</span>
                <span className="detail-value">{formatPremium(ticker.totalPremium)}</span>
              </div>
              <div className="detail-row">
                <Calendar className="detail-icon" />
                <span className="detail-label">Expiries:</span>
                <span className="detail-value">{ticker.uniqueExpiries.length}</span>
              </div>
            </div>
            
            <div className="ticker-footer">
              <div className="last-activity">
                <Clock className="activity-icon" />
                <span>{getTimeAgo(ticker.lastActivity)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

TickerList.displayName = 'TickerList';

export default TickerList;
