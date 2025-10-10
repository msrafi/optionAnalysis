import React, { memo, useMemo, useCallback } from 'react';
import { Clock, TrendingUp, TrendingDown } from 'lucide-react';
import { OptionData, formatVolume, formatPremium } from '../utils/dataParser';

interface TradeListProps {
  trades: OptionData[];
  ticker: string;
  expiry?: string;
}

interface TradeRowProps {
  trade: OptionData;
  index: number;
}

const TradeRow: React.FC<TradeRowProps> = memo(({ trade, index }) => {
  const formatTime = useCallback((timestamp: string): string => {
    try {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) return 'Unknown';
      
      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
    } catch (error) {
      return 'Unknown';
    }
  }, []);

  const getSideColor = useCallback((side: string) => {
    switch (side.toLowerCase()) {
      case 'bid':
      case 'below':
        return '#4caf50'; // Green
      case 'ask':
      case 'above':
        return '#f44336'; // Red
      default:
        return '#ff9800'; // Orange
    }
  }, []);

  const getSideIcon = useCallback((side: string) => {
    switch (side.toLowerCase()) {
      case 'bid':
      case 'below':
        return <TrendingDown className="side-icon" />;
      case 'ask':
      case 'above':
        return <TrendingUp className="side-icon" />;
      default:
        return null;
    }
  }, []);

  return (
    <div className="trade-row">
      <div className="trade-indicators">
        <div 
          className="side-indicator" 
          style={{ backgroundColor: getSideColor(trade.sweepType) }}
        />
        <div className="time-indicator" />
      </div>
      
      <div className="trade-content">
        <div className="trade-symbol">{trade.ticker}</div>
        <div className="trade-strike">{trade.strike}</div>
        <div className="trade-expiry">{new Date(trade.expiry).toLocaleDateString()}</div>
        <div className={`trade-type ${trade.optionType.toLowerCase()}`}>{trade.optionType}</div>
        <div className="trade-side">
          {getSideIcon(trade.sweepType)}
          <span>{trade.sweepType}</span>
        </div>
        <div className="trade-size">{trade.volume.toLocaleString()}</div>
        <div className="trade-premium">{formatPremium(parseFloat(trade.premium.replace(/[$,]/g, '')))}</div>
        <div className="trade-volume">{formatVolume(trade.volume)}</div>
        <div className="trade-oi">{trade.openInterest.toLocaleString()}</div>
        <div className="trade-time">
          <Clock className="time-icon" />
          <span>{formatTime(trade.timestamp)}</span>
        </div>
      </div>
    </div>
  );
});

TradeRow.displayName = 'TradeRow';

const TradeList: React.FC<TradeListProps> = memo(({ trades, ticker, expiry }) => {
  
  const sortedTrades = useMemo(() => {
    return [...trades].sort((a, b) => {
      // Sort by timestamp (most recent first)
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });
  }, [trades]);

  const filteredTrades = useMemo(() => {
    if (!expiry) return sortedTrades;
    return sortedTrades.filter(trade => trade.expiry === expiry);
  }, [sortedTrades, expiry]);

  if (filteredTrades.length === 0) {
    return (
      <div className="trade-list">
        <div className="trade-list-header">
          <h3>{ticker} Trade History</h3>
          {expiry && <span className="expiry-filter">Filtered by: {new Date(expiry).toLocaleDateString()}</span>}
        </div>
        <div className="no-trades">
          <p>No trades found for {ticker}{expiry ? ` on ${new Date(expiry).toLocaleDateString()}` : ''}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="trade-list">
      <div className="trade-list-header">
        <h3>{ticker} Trade History</h3>
        {expiry && <span className="expiry-filter">Filtered by: {new Date(expiry).toLocaleDateString()}</span>}
        <div className="trade-count">{filteredTrades.length} trades</div>
      </div>
      
      <div className="trade-list-content">
        <div className="trade-list-table">
          <div className="trade-table-header">
            <div className="header-cell">Symbol</div>
            <div className="header-cell">Strike</div>
            <div className="header-cell">Expiration</div>
            <div className="header-cell">Call/Put</div>
            <div className="header-cell">Side</div>
            <div className="header-cell">Size</div>
            <div className="header-cell">Premium</div>
            <div className="header-cell">Volume</div>
            <div className="header-cell">OI</div>
            <div className="header-cell">Time</div>
          </div>
          
          <div className="trade-table-body">
            {filteredTrades.map((trade, index) => (
              <TradeRow key={`${trade.ticker}-${trade.strike}-${trade.expiry}-${trade.timestamp}-${index}`} trade={trade} index={index} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
});

TradeList.displayName = 'TradeList';

export default TradeList;
