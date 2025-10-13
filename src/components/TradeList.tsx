import React, { memo, useMemo, useCallback, useState } from 'react';
import { ArrowUpDown } from 'lucide-react';
import { OptionData, formatVolume, parseTimestampFromData } from '../utils/dataParser';

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
  const formatExecutionDateTime = (timestamp: string): string => {
    try {
      // Parse the timestamp format from CSV data
      // Expected format: "Thursday, October 9, 2025 at 2:15 PM"
      const fullMatch = timestamp.match(/(\w+),\s+(\w+)\s+(\d+),\s+(\d+)\s+at\s+(\d+):(\d+)\s+(AM|PM)/i);
      
      if (fullMatch) {
        const [, , monthName, day, , hour, minute, ampm] = fullMatch;
        
        // Convert to 24-hour format
        let hour24 = parseInt(hour);
        if (ampm.toUpperCase() === 'PM' && hour24 !== 12) {
          hour24 += 12;
        } else if (ampm.toUpperCase() === 'AM' && hour24 === 12) {
          hour24 = 0;
        }
        
        // Format date as MM/DD
        const monthMap: { [key: string]: string } = {
          'january': '01', 'february': '02', 'march': '03', 'april': '04',
          'may': '05', 'june': '06', 'july': '07', 'august': '08',
          'september': '09', 'october': '10', 'november': '11', 'december': '12'
        };
        
        const month = monthMap[monthName.toLowerCase()] || '01';
        const formattedDate = `${month}/${day.padStart(2, '0')}`;
        const formattedTime = `${hour24.toString().padStart(2, '0')}:${minute}`;
        
        return `${formattedDate} ${formattedTime}`;
      }
      
      // Fallback to standard date parsing
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) return 'Unknown';
      
      return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' }) + ' ' + 
             date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    } catch (error) {
      return 'Unknown';
    }
  };

  // Parse premium to check if over $1M
  const parsePremiumValue = (premium: string): number => {
    const cleanPremium = premium.replace(/[$,]/g, '');
    const num = parseFloat(cleanPremium);
    
    if (premium.includes('M')) {
      return num * 1000000;
    } else if (premium.includes('K')) {
      return num * 1000;
    }
    return num;
  };

  const premiumValue = parsePremiumValue(trade.premium);
  const isHighValue = premiumValue >= 1000000;

  return (
    <div 
      className="trade-row-horizontal"
      style={{
        backgroundColor: trade.optionType === 'Call' 
          ? (isHighValue ? 'rgba(0, 80, 0, 0.7)' : 'rgba(0, 100, 0, 0.5)') // Darker green for high value
          : (isHighValue ? 'rgba(100, 0, 0, 0.7)' : 'rgba(139, 0, 0, 0.5)'), // Darker red for high value
      }}
    >
      <div className="trade-cell-h symbol">{trade.ticker}</div>
      <div className="trade-cell-h strike">{trade.strike}</div>
      <div className="trade-cell-h expiry">{new Date(trade.expiry).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })}</div>
      <div className="trade-cell-h type">{trade.optionType}</div>
      <div className="trade-cell-h side">{trade.sweepType}</div>
      <div className="trade-cell-h size">{formatVolume(trade.volume)}</div>
      <div className="trade-cell-h premium">{trade.premium}</div>
      <div className="trade-cell-h volume">{formatVolume(trade.volume)}</div>
      <div className="trade-cell-h oi">{formatVolume(trade.openInterest)}</div>
      <div className="trade-cell-h exec-time">{formatExecutionDateTime(trade.timestamp)}</div>
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
            <div className="header-cell">Exec Time</div>
          </div>
          
          <div className="trade-table-body">
            {filteredTrades.map((trade, index) => (
              <TradeRow key={getTradeKey(trade, index)} trade={trade} index={index} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
});

TradeList.displayName = 'TradeList';

export default TradeList;
