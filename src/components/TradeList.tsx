import React, { memo, useMemo, useCallback, useState } from 'react';
import { Clock, TrendingUp, TrendingDown, ArrowUpDown } from 'lucide-react';
import { OptionData, formatVolume, formatPremium, parseTimestampFromData } from '../utils/dataParser';
import VirtualizedList from './VirtualizedList';

interface TradeListProps {
  trades: OptionData[];
  ticker: string;
  expiry?: string;
}

interface TradeRowProps {
  trade: OptionData;
  index: number;
}

const TradeRow: React.FC<TradeRowProps> = memo(({ trade }) => {
  const formatDateTime = useCallback((timestamp: string): { date: string; time: string } => {
    try {
      // Try to parse the timestamp format from CSV data
      // Expected format: "Thursday, October 9, 2025 at 2:15 PM"
      const fullMatch = timestamp.match(/(\w+),\s+(\w+)\s+(\d+),\s+(\d+)\s+at\s+(\d+):(\d+)\s+(AM|PM)/i);
      
      if (fullMatch) {
        const [, , monthName, day, year, hour, minute, ampm] = fullMatch;
        
        // Convert to 24-hour format
        let hour24 = parseInt(hour);
        if (ampm.toUpperCase() === 'PM' && hour24 !== 12) {
          hour24 += 12;
        } else if (ampm.toUpperCase() === 'AM' && hour24 === 12) {
          hour24 = 0;
        }
        
        // Format date as MM/DD/YYYY
        const monthMap: { [key: string]: string } = {
          'january': '01', 'february': '02', 'march': '03', 'april': '04',
          'may': '05', 'june': '06', 'july': '07', 'august': '08',
          'september': '09', 'october': '10', 'november': '11', 'december': '12'
        };
        
        const month = monthMap[monthName.toLowerCase()] || '01';
        const formattedDate = `${month}/${day.padStart(2, '0')}/${year}`;
        const formattedTime = `${hour24.toString().padStart(2, '0')}:${minute}:00`;
        
        return { date: formattedDate, time: formattedTime };
      }
      
      // Fallback to standard date parsing
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) return { date: 'Unknown', time: 'Unknown' };
      
      return {
        date: date.toLocaleDateString('en-US'),
        time: date.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        })
      };
    } catch (error) {
      return { date: 'Unknown', time: 'Unknown' };
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
    <div 
      className="trade-row"
      style={{
        backgroundColor: trade.optionType === 'Call' 
          ? 'rgba(3, 64, 5, 0.86)' // Green background for Calls
          : 'rgba(232, 27, 13, 0.86)', // Red background for Puts
        borderLeft: `4px solid ${trade.optionType === 'Call' ? '#4caf50' : '#f44336'}`
      }}
    >
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
        <div className="trade-datetime">
          <Clock className="time-icon" />
          <div className="datetime-container">
            <span className="trade-date">{formatDateTime(trade.timestamp).date}</span>
            <span className="trade-time">{formatDateTime(trade.timestamp).time}</span>
          </div>
        </div>
      </div>
    </div>
  );
});

TradeRow.displayName = 'TradeRow';

type SortOption = 'trade-date' | 'expiry-date' | 'size';

const TradeList: React.FC<TradeListProps> = memo(({ trades, ticker, expiry }) => {
  const [sortBy, setSortBy] = useState<SortOption>('trade-date');
  
  const sortedTrades = useMemo(() => {
    return [...trades].sort((a, b) => {
      switch (sortBy) {
        case 'trade-date': {
          // Sort by timestamp (most recent first)
          const dateA = parseTimestampFromData(a.timestamp);
          const dateB = parseTimestampFromData(b.timestamp);
          if (!dateA || !dateB) return 0;
          return dateB.getTime() - dateA.getTime();
        }
        case 'expiry-date': {
          // Sort by expiry date (earliest first)
          const expiryA = new Date(a.expiry);
          const expiryB = new Date(b.expiry);
          return expiryA.getTime() - expiryB.getTime();
        }
        case 'size': {
          // Sort by volume (largest first)
          return b.volume - a.volume;
        }
        default:
          return 0;
      }
    });
  }, [trades, sortBy]);

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

  const renderTradeItem = useCallback((trade: OptionData, index: number) => (
    <TradeRow trade={trade} index={index} />
  ), []);

  const getTradeKey = useCallback((trade: OptionData, index: number) => 
    `${trade.ticker}-${trade.strike}-${trade.expiry}-${trade.timestamp}-${index}`,
    []
  );

  return (
    <div className="trade-list">
      <div className="trade-list-header">
        <div className="header-left">
          <h3>{ticker} Trade History</h3>
          {expiry && <span className="expiry-filter">Filtered by: {new Date(expiry).toLocaleDateString()}</span>}
        </div>
        <div className="header-right">
          <div className="sort-controls">
            <ArrowUpDown className="sort-icon" />
            <select 
              className="sort-selector"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
            >
              <option value="trade-date">Sort by Trade Date (Recent First)</option>
              <option value="expiry-date">Sort by Expiry Date (Earliest First)</option>
              <option value="size">Sort by Size (Largest First)</option>
            </select>
          </div>
          <div className="trade-count">{filteredTrades.length} trades</div>
        </div>
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
            <div className="header-cell">Date/Time</div>
          </div>
          
          <div className="trade-table-body">
            <VirtualizedList
              items={filteredTrades}
              itemHeight={80}
              containerHeight={500}
              renderItem={renderTradeItem as (item: unknown, index: number) => React.ReactNode}
              keyExtractor={getTradeKey as (item: unknown, index: number) => string}
              overscan={3}
            />
          </div>
        </div>
      </div>
    </div>
  );
});

TradeList.displayName = 'TradeList';

export default TradeList;
