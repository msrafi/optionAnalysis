import React, { memo, useMemo, useState } from 'react';
import { TrendingUp, TrendingDown, Calendar, Clock, ArrowUpDown, Target } from 'lucide-react';
import { DarkPoolData } from '../utils/dataParser';

interface DarkPoolTickerSummary {
  ticker: string;
  totalValue: number;
  totalQuantity: number;
  tradeCount: number;
  averagePrice: number;
  lastActivity: string;
  maxTradeValue: number;
  minTradeValue: number;
  maxQuantity: number;
  minQuantity: number;
  avgTradeSize: number;
  priceVolatility: number;
  highestVolumePrice: number;
  highestVolumeTime: string;
  highestVolumeQuantity: number;
}

interface DarkPoolTickerListProps {
  tickers: DarkPoolTickerSummary[];
  onTickerSelect: (ticker: string) => void;
  allData: DarkPoolData[];
}

type SortOption = 'recent' | 'oldest' | 'value-high' | 'value-low' | 'quantity-high' | 'quantity-low' | 'trades-high' | 'trades-low' | 'volume-high' | 'volume-low';

const formatDateTime = (timestamp: string): string => {
  try {
    const time = new Date(timestamp);
    
    // Check if the date is valid
    if (isNaN(time.getTime())) {
      return '';
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
    return '';
  }
};

const formatVolume = (volume: number): string => {
  if (volume >= 1000000) {
    return `${(volume / 1000000).toFixed(1)}M`;
  } else if (volume >= 1000) {
    return `${(volume / 1000).toFixed(1)}K`;
  }
  return volume.toString();
};

const formatValue = (value: number): string => {
  if (value >= 1000000000) {
    return `$${(value / 1000000000).toFixed(1)}B`;
  } else if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`;
  } else if (value >= 1000) {
    return `$${(value / 1000).toFixed(1)}K`;
  }
  return `$${value.toFixed(2)}`;
};

const DarkPoolTickerList: React.FC<DarkPoolTickerListProps> = memo(({ tickers, onTickerSelect, allData }) => {
  const [sortBy, setSortBy] = useState<SortOption>('recent');

  const sortedTickers = useMemo(() => {
    const sorted = [...tickers];
    
    switch (sortBy) {
      case 'recent':
        return sorted.sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime());
      case 'oldest':
        return sorted.sort((a, b) => new Date(a.lastActivity).getTime() - new Date(b.lastActivity).getTime());
      case 'value-high':
        return sorted.sort((a, b) => b.totalValue - a.totalValue);
      case 'value-low':
        return sorted.sort((a, b) => a.totalValue - b.totalValue);
      case 'quantity-high':
        return sorted.sort((a, b) => b.totalQuantity - a.totalQuantity);
      case 'quantity-low':
        return sorted.sort((a, b) => a.totalQuantity - b.totalQuantity);
      case 'trades-high':
        return sorted.sort((a, b) => b.tradeCount - a.tradeCount);
      case 'trades-low':
        return sorted.sort((a, b) => a.tradeCount - b.tradeCount);
      case 'volume-high':
        return sorted.sort((a, b) => b.highestVolumeQuantity - a.highestVolumeQuantity);
      case 'volume-low':
        return sorted.sort((a, b) => a.highestVolumeQuantity - b.highestVolumeQuantity);
      default:
        return sorted;
    }
  }, [tickers, sortBy]);

  return (
    <div className="ticker-list-container">
      <div className="ticker-list-header">
        <h2>Dark Pool Tickers</h2>
        <p>Select a ticker to view detailed dark pool activity</p>
        <div className="sort-controls">
          <ArrowUpDown className="sort-icon" />
          <select 
            className="sort-selector"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
          >
            <option value="recent">Most Recent</option>
            <option value="oldest">Oldest First</option>
            <option value="value-high">Value (High to Low)</option>
            <option value="value-low">Value (Low to High)</option>
            <option value="quantity-high">Quantity (High to Low)</option>
            <option value="quantity-low">Quantity (Low to High)</option>
            <option value="trades-high">Trades (High to Low)</option>
            <option value="trades-low">Trades (Low to High)</option>
            <option value="volume-high">High Volume (High to Low)</option>
            <option value="volume-low">High Volume (Low to High)</option>
          </select>
        </div>
      </div>
      
      <div className="ticker-grid">
        {sortedTickers.map((ticker) => {
          // Get the last trade for this ticker
          const lastTrade = allData
            .filter(trade => trade.ticker === ticker.ticker)
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
          
          return (
            <div 
              key={ticker.ticker} 
              className="ticker-card darkpool-card"
              onClick={() => onTickerSelect(ticker.ticker)}
            >
              <div className="ticker-header">
                <h3 className="ticker-symbol">
                  {ticker.ticker}
                </h3>
                <div className="ticker-metrics">
                  <div className="metric">
                    <TrendingUp className="metric-icon value" />
                    <span className="metric-label">Total Value</span>
                    <span className="metric-value">{formatValue(ticker.totalValue)}</span>
                  </div>
                  <div className="metric">
                    <TrendingDown className="metric-icon quantity" />
                    <span className="metric-label">Quantity</span>
                    <span className="metric-value">{formatVolume(ticker.totalQuantity)}</span>
                  </div>
                </div>
              </div>
              
              <div className="ticker-details">
                <div className="detail-row">
                  <span className="detail-label">Total Trades:</span>
                  <span className="detail-value">{ticker.tradeCount}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Avg Price:</span>
                  <span className="detail-value">${ticker.averagePrice.toFixed(2)}</span>
                </div>
                <div className="detail-row">
                  <Calendar className="detail-icon" />
                  <span className="detail-label">Max Trade:</span>
                  <span className="detail-value">{formatValue(ticker.maxTradeValue)}</span>
                </div>
                {lastTrade && (
                  <div className="detail-row last-trade-row">
                    <span className="detail-label">Last Trade:</span>
                    <span className="detail-value last-trade">
                      {formatValue(lastTrade.price * lastTrade.quantity)} 
                      <span className="trade-side">
                        {formatVolume(lastTrade.quantity)} @ ${lastTrade.price.toFixed(2)}
                      </span>
                    </span>
                  </div>
                )}
              </div>
              
              {/* Analytics Section */}
              <div className="ticker-analytics">
                <div className="analytics-badge key-levels-badge">
                  <Target size={12} />
                  <span className="badge-label">High Volume:</span>
                  <span className="badge-strikes">
                    {formatVolume(ticker.highestVolumeQuantity)} @ ${ticker.highestVolumePrice.toFixed(2)}
                  </span>
                </div>
                <div className="analytics-badge max-pain-badge">
                  <Clock size={12} />
                  <span className="badge-label">Peak Time:</span>
                  <span className="badge-strikes">
                    {formatDateTime(ticker.highestVolumeTime)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      
      {sortedTickers.length === 0 && (
        <div className="no-tickers">
          <p>No dark pool tickers found</p>
        </div>
      )}
    </div>
  );
});

DarkPoolTickerList.displayName = 'DarkPoolTickerList';

export default DarkPoolTickerList;
