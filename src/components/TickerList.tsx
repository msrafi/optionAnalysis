import React, { memo, useMemo, useState } from 'react';
import { TrendingUp, TrendingDown, Calendar, Clock, ArrowUpDown, Target, Zap } from 'lucide-react';
import { TickerSummary, formatVolume, formatPremium, OptionData, getTickerAnalytics } from '../utils/dataParser';

interface TickerListProps {
  tickers: TickerSummary[];
  onTickerSelect: (ticker: string) => void;
  allData: OptionData[];
}

type SortOption = 'recent' | 'oldest' | 'volume-high' | 'volume-low' | 'calls-high' | 'puts-high' | 'premium-high' | 'premium-low';

const formatDateTime = (timestamp: string, parsedDate?: Date | null): string => {
  try {
    let time: Date;
    
    // Use parsed date if available, otherwise try to parse the timestamp string
    if (parsedDate) {
      time = parsedDate;
    } else {
      time = new Date(timestamp);
    }
    
    // Check if the date is valid
    if (isNaN(time.getTime())) {
      return 'Unknown';
    }
    
    // Format as "Oct 8, 2025 3:02 PM"
    return time.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }) + ' ' + time.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('Error parsing timestamp:', timestamp, error);
    }
    return 'Unknown';
  }
};

const TickerList: React.FC<TickerListProps> = memo(({ tickers, onTickerSelect, allData }) => {
  const [sortBy, setSortBy] = useState<SortOption>('recent');

  const sortedTickers = useMemo(() => {
    const sorted = [...tickers];
    
    switch (sortBy) {
      case 'recent':
        return sorted.sort((a, b) => {
          if (a.lastActivityDate && b.lastActivityDate) {
            return b.lastActivityDate.getTime() - a.lastActivityDate.getTime();
          }
          return 0;
        });
      
      case 'oldest':
        return sorted.sort((a, b) => {
          if (a.lastActivityDate && b.lastActivityDate) {
            return a.lastActivityDate.getTime() - b.lastActivityDate.getTime();
          }
          return 0;
        });
      
      case 'volume-high':
        return sorted.sort((a, b) => b.totalVolume - a.totalVolume);
      
      case 'volume-low':
        return sorted.sort((a, b) => a.totalVolume - b.totalVolume);
      
      case 'calls-high':
        return sorted.sort((a, b) => b.callVolume - a.callVolume);
      
      case 'puts-high':
        return sorted.sort((a, b) => b.putVolume - a.putVolume);
      
      case 'premium-high':
        return sorted.sort((a, b) => b.totalPremium - a.totalPremium);
      
      case 'premium-low':
        return sorted.sort((a, b) => a.totalPremium - b.totalPremium);
      
      default:
        return sorted;
    }
  }, [tickers, sortBy]);

  return (
    <div className="ticker-list">
      <div className="ticker-list-header">
        <div className="header-content">
          <h2>Options Volume Dashboard</h2>
          {/* <p>Click on any ticker to view detailed volume profile</p> */}
        </div>
        <div className="sort-controls">
          <ArrowUpDown className="sort-icon" />
          <select 
            className="sort-selector"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
          >
            <option value="recent">Most Recent</option>
            <option value="oldest">Oldest First</option>
            <option value="volume-high">Volume (High to Low)</option>
            <option value="volume-low">Volume (Low to High)</option>
            <option value="calls-high">Calls (High to Low)</option>
            <option value="puts-high">Puts (High to Low)</option>
            <option value="premium-high">Premium (High to Low)</option>
            <option value="premium-low">Premium (Low to High)</option>
          </select>
        </div>
      </div>
      
      <div className="ticker-grid">
        {sortedTickers.map((ticker) => {
          const callDominant = ticker.callVolume > ticker.putVolume;
          const putDominant = ticker.putVolume > ticker.callVolume;
          const dominanceClass = callDominant ? 'call-dominant' : putDominant ? 'put-dominant' : 'balanced';
          
          // Calculate analytics for this ticker
          const analytics = getTickerAnalytics(ticker.ticker, allData);
          
          return (
            <div 
              key={ticker.ticker} 
              className={`ticker-card ${dominanceClass}`}
              onClick={() => onTickerSelect(ticker.ticker)}
            >
            <div className="ticker-header">
              <h3 className="ticker-symbol">
                {ticker.ticker}
              </h3>
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
                  {ticker.lastTrade && (
                    <div className="detail-row last-trade-row">
                      <span className="detail-label">Last Trade:</span>
                      <span className="detail-value last-trade">
                        {ticker.lastTrade.optionType} ${ticker.lastTrade.strike} 
                        <span className={`trade-side ${ticker.lastTrade.optionType.toLowerCase()}`}>
                          {ticker.lastTrade.optionType === 'Call' ? '↗' : '↘'}
                        </span>
                        {formatVolume(ticker.lastTrade.volume)}
                      </span>
                    </div>
                  )}
                </div>
                
                {/* Analytics Section */}
                {(analytics.keyPriceLevels.length > 0 || analytics.maxPainStrike) && (
                  <div className="ticker-analytics">
                    {analytics.keyPriceLevels.length > 0 && (
                      <div className="analytics-badge key-levels-badge">
                        <Target size={12} />
                        <span className="badge-label">Key Levels:</span>
                        <span className="badge-strikes">
                          {analytics.keyPriceLevels.slice(0, 3).map((level, idx) => (
                            <span 
                              key={level.strike} 
                              className={`level-strike level-${level.significance}`}
                              title={`${level.type === 'call' ? 'Call' : level.type === 'put' ? 'Put' : 'Call/Put'} - Vol: ${formatVolume(level.volume)}, OI: ${formatVolume(level.openInterest)}`}
                            >
                              {idx > 0 && ', '}${level.strike}
                            </span>
                          ))}
                        </span>
                      </div>
                    )}
                    
                    {analytics.maxPainStrike && (
                      <div className="analytics-badge max-pain-badge">
                        <Zap size={12} />
                        <span className="badge-label">Max Pain:</span>
                        <span className="badge-value">${analytics.maxPainStrike}</span>
                      </div>
                    )}
                  </div>
                )}
                
                <div className="ticker-footer">
                  <div className="last-activity">
                    <Clock className="activity-icon" />
                    <span>{formatDateTime(ticker.lastActivity, ticker.lastActivityDate)}</span>
                  </div>
                </div>
          </div>
          );
        })}
      </div>
    </div>
  );
});

TickerList.displayName = 'TickerList';

export default TickerList;
