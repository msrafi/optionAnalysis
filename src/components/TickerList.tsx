import React, { memo, useMemo, useState } from 'react';
import { TrendingUp, TrendingDown, Calendar, ArrowUpDown, Target } from 'lucide-react';
import { TickerSummary, formatVolume, formatPremium, OptionData } from '../utils/dataParser';

interface TickerListProps {
  tickers: TickerSummary[];
  onTickerSelect: (ticker: string) => void;
  allData: OptionData[];
}

type SortOption = 'recent' | 'oldest' | 'volume-high' | 'volume-low' | 'calls-high' | 'puts-high' | 'premium-high' | 'premium-low' | 'today-volume-high' | 'today-volume-low';

const formatDateTime = (timestamp: string, parsedDate?: Date | null): string => {
  try {
    let time: Date;
    
    // Use parsed date if available, otherwise try to parse the timestamp string
    if (parsedDate) {
      time = parsedDate;
    } else {
      // Try to parse the timestamp using the same logic as parseTimestampFromData
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      // Convert month name to number
      const monthMap: { [key: string]: number } = {
        'january': 0, 'february': 1, 'march': 2, 'april': 3,
        'may': 4, 'june': 5, 'july': 6, 'august': 7,
        'september': 8, 'october': 9, 'november': 10, 'december': 11
      };
      
      // Helper function to convert 12-hour to 24-hour format
      const convertTo24Hour = (hour: string, ampm: string): number => {
        let hour24 = parseInt(hour);
        if (ampm.toUpperCase() === 'PM' && hour24 !== 12) {
          hour24 += 12;
        } else if (ampm.toUpperCase() === 'AM' && hour24 === 12) {
          hour24 = 0;
        }
        return hour24;
      };
      
      // Handle format: "Wednesday, October 8, 2025 at 3:02 PM"
      let match = timestamp.match(/(\w+),\s+(\w+)\s+(\d+),\s+(\d+)\s+at\s+(\d+):(\d+)\s+(AM|PM)/i);
      if (match) {
        const [, , monthName, day, year, hour, minute, ampm] = match;
        const month = monthMap[monthName.toLowerCase()];
        if (month !== undefined) {
          const hour24 = convertTo24Hour(hour, ampm);
          time = new Date(parseInt(year), month, parseInt(day), hour24, parseInt(minute));
        } else {
          time = new Date(timestamp);
        }
      }
      // Handle format: "Yesterday at 3:55 PM"
      else if ((match = timestamp.match(/Yesterday at (\d+):(\d+)\s+(AM|PM)/i))) {
        const [, hour, minute, ampm] = match;
        const hour24 = convertTo24Hour(hour, ampm);
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        time = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), hour24, parseInt(minute));
      }
      // Handle format: "9:45 AM" (today's time)
      else if ((match = timestamp.match(/(\d+):(\d+)\s+(AM|PM)/i))) {
        const [, hour, minute, ampm] = match;
        const hour24 = convertTo24Hour(hour, ampm);
        time = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hour24, parseInt(minute));
      }
      else {
        time = new Date(timestamp);
      }
    }
    
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

const TickerList: React.FC<TickerListProps> = memo(({ tickers, onTickerSelect, allData }) => {
  const [sortBy, setSortBy] = useState<SortOption>('recent');

  // Helper function to get today's volume for a ticker
  const getTodayVolume = (ticker: string): number => {
    const tickerTrades = allData.filter(t => t.ticker === ticker);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let todayVolume = 0;
    
    tickerTrades.forEach(trade => {
      let tradeDate: Date;
      try {
        const timestampStr = trade.timestamp;
        const now = new Date();
        const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        
        const monthMap: { [key: string]: number } = {
          'january': 0, 'february': 1, 'march': 2, 'april': 3,
          'may': 4, 'june': 5, 'july': 6, 'august': 7,
          'september': 8, 'october': 9, 'november': 10, 'december': 11
        };
        
        const convertTo24Hour = (hour: string, ampm: string): number => {
          let hour24 = parseInt(hour);
          if (ampm.toUpperCase() === 'PM' && hour24 !== 12) {
            hour24 += 12;
          } else if (ampm.toUpperCase() === 'AM' && hour24 === 12) {
            hour24 = 0;
          }
          return hour24;
        };
        
        let match = timestampStr.match(/(\w+),\s+(\w+)\s+(\d+),\s+(\d+)\s+at\s+(\d+):(\d+)\s+(AM|PM)/i);
        if (match) {
          const [, , monthName, day, year, hour, minute, ampm] = match;
          const month = monthMap[monthName.toLowerCase()];
          if (month !== undefined) {
            const hour24 = convertTo24Hour(hour, ampm);
            tradeDate = new Date(parseInt(year), month, parseInt(day), hour24, parseInt(minute));
          } else {
            return;
          }
        }
        else if ((match = timestampStr.match(/Yesterday at (\d+):(\d+)\s+(AM|PM)/i))) {
          const [, hour, minute, ampm] = match;
          const hour24 = convertTo24Hour(hour, ampm);
          const yesterday = new Date(todayDate);
          yesterday.setDate(yesterday.getDate() - 1);
          tradeDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), hour24, parseInt(minute));
        }
        else if ((match = timestampStr.match(/(\d+):(\d+)\s+(AM|PM)/i))) {
          const [, hour, minute, ampm] = match;
          const hour24 = convertTo24Hour(hour, ampm);
          tradeDate = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate(), hour24, parseInt(minute));
        }
        else {
          return;
        }
        
        tradeDate.setHours(0, 0, 0, 0);
        const daysAgo = Math.floor((today.getTime() - tradeDate.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysAgo === 0) {
          todayVolume += trade.volume;
        }
      } catch (error) {
        // Skip this trade if we can't parse the date
      }
    });
    
    return todayVolume;
  };

  const sortedTickers = useMemo(() => {
    const sorted = [...tickers];
    
    switch (sortBy) {
      case 'recent':
        return sorted.sort((a, b) => {
          const dateA = a.lastActivityDate instanceof Date ? a.lastActivityDate : (a.lastActivityDate ? new Date(a.lastActivityDate) : null);
          const dateB = b.lastActivityDate instanceof Date ? b.lastActivityDate : (b.lastActivityDate ? new Date(b.lastActivityDate) : null);
          
          if (dateA && dateB) {
            return dateB.getTime() - dateA.getTime();
          }
          return 0;
        });
      
      case 'oldest':
        return sorted.sort((a, b) => {
          const dateA = a.lastActivityDate instanceof Date ? a.lastActivityDate : (a.lastActivityDate ? new Date(a.lastActivityDate) : null);
          const dateB = b.lastActivityDate instanceof Date ? b.lastActivityDate : (b.lastActivityDate ? new Date(b.lastActivityDate) : null);
          
          if (dateA && dateB) {
            return dateA.getTime() - dateB.getTime();
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
      
      case 'today-volume-high':
        return sorted.sort((a, b) => getTodayVolume(b.ticker) - getTodayVolume(a.ticker));
      
      case 'today-volume-low':
        return sorted.sort((a, b) => getTodayVolume(a.ticker) - getTodayVolume(b.ticker));
      
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
            <option value="today-volume-high">Today's Volume (High to Low)</option>
            <option value="today-volume-low">Today's Volume (Low to High)</option>
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
                  {/* 3-Day Volume Section */}
                  {(() => {
                    const tickerTrades = allData.filter(t => t.ticker === ticker.ticker);
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    
                    const dayVolumes = [0, 0, 0]; // [2 days ago, 1 day ago, today]
                    const dayCallVolumes = [0, 0, 0];
                    const dayPutVolumes = [0, 0, 0];
                    
                    tickerTrades.forEach(trade => {
                      // Parse the timestamp string to get the date
                      let tradeDate: Date;
                      try {
                        // Try to parse using the formatDateTime logic
                        const timestampStr = trade.timestamp;
                        const now = new Date();
                        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                        
                        const monthMap: { [key: string]: number } = {
                          'january': 0, 'february': 1, 'march': 2, 'april': 3,
                          'may': 4, 'june': 5, 'july': 6, 'august': 7,
                          'september': 8, 'october': 9, 'november': 10, 'december': 11
                        };
                        
                        const convertTo24Hour = (hour: string, ampm: string): number => {
                          let hour24 = parseInt(hour);
                          if (ampm.toUpperCase() === 'PM' && hour24 !== 12) {
                            hour24 += 12;
                          } else if (ampm.toUpperCase() === 'AM' && hour24 === 12) {
                            hour24 = 0;
                          }
                          return hour24;
                        };
                        
                        let match = timestampStr.match(/(\w+),\s+(\w+)\s+(\d+),\s+(\d+)\s+at\s+(\d+):(\d+)\s+(AM|PM)/i);
                        if (match) {
                          const [, , monthName, day, year, hour, minute, ampm] = match;
                          const month = monthMap[monthName.toLowerCase()];
                          if (month !== undefined) {
                            const hour24 = convertTo24Hour(hour, ampm);
                            tradeDate = new Date(parseInt(year), month, parseInt(day), hour24, parseInt(minute));
                          } else {
                            tradeDate = new Date(timestampStr);
                          }
                        }
                        // Handle format: "Yesterday at 3:55 PM"
                        else if ((match = timestampStr.match(/Yesterday at (\d+):(\d+)\s+(AM|PM)/i))) {
                          const [, hour, minute, ampm] = match;
                          const hour24 = convertTo24Hour(hour, ampm);
                          const yesterday = new Date(today);
                          yesterday.setDate(yesterday.getDate() - 1);
                          tradeDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), hour24, parseInt(minute));
                        }
                        // Handle format: "9:45 AM" (today's time)
                        else if ((match = timestampStr.match(/(\d+):(\d+)\s+(AM|PM)/i))) {
                          const [, hour, minute, ampm] = match;
                          const hour24 = convertTo24Hour(hour, ampm);
                          tradeDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hour24, parseInt(minute));
                        }
                        else {
                          tradeDate = new Date(timestampStr);
                        }
                      } catch (error) {
                        return; // Skip this trade if we can't parse the date
                      }
                      
                      tradeDate.setHours(0, 0, 0, 0);
                      const daysAgo = Math.floor((today.getTime() - tradeDate.getTime()) / (1000 * 60 * 60 * 24));
                      
                      if (daysAgo >= 0 && daysAgo <= 2) {
                        dayVolumes[2 - daysAgo] += trade.volume;
                        if (trade.optionType === 'Call') {
                          dayCallVolumes[2 - daysAgo] += trade.volume;
                        } else {
                          dayPutVolumes[2 - daysAgo] += trade.volume;
                        }
                      }
                    });
                    
                    return (
                      <div className="detail-row volume-3day">
                        <span className="detail-label">3-Day Volume:</span>
                        <div className="volume-breakdown">
                          <span className="day-volume">
                            <span className="day-label">Today:</span>
                            <span className="day-value">{formatVolume(dayVolumes[2])}</span>
                          </span>
                          <span className="day-volume">
                            <span className="day-label">-1:</span>
                            <span className="day-value">{formatVolume(dayVolumes[1])}</span>
                          </span>
                          <span className="day-volume">
                            <span className="day-label">-2:</span>
                            <span className="day-value">{formatVolume(dayVolumes[0])}</span>
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
                
                {/* Current Week Volume by Strike */}
                {(() => {
                  const tickerTrades = allData.filter(t => t.ticker === ticker.ticker);
                  const today = new Date();
                  const currentWeekStart = new Date(today);
                  // Get Monday of current week
                  const dayOfWeek = today.getDay();
                  currentWeekStart.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
                  currentWeekStart.setHours(0, 0, 0, 0);
                  
                  // Calculate volume by strike for this week
                  const strikeVolumes = new Map<number, { volume: number; callVolume: number; putVolume: number }>();
                  
                  tickerTrades.forEach(trade => {
                    let tradeDate: Date;
                    try {
                      const timestampStr = trade.timestamp;
                      const now = new Date();
                      const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                      
                      const monthMap: { [key: string]: number } = {
                        'january': 0, 'february': 1, 'march': 2, 'april': 3,
                        'may': 4, 'june': 5, 'july': 6, 'august': 7,
                        'september': 8, 'october': 9, 'november': 10, 'december': 11
                      };
                      
                      const convertTo24Hour = (hour: string, ampm: string): number => {
                        let hour24 = parseInt(hour);
                        if (ampm.toUpperCase() === 'PM' && hour24 !== 12) {
                          hour24 += 12;
                        } else if (ampm.toUpperCase() === 'AM' && hour24 === 12) {
                          hour24 = 0;
                        }
                        return hour24;
                      };
                      
                      let match = timestampStr.match(/(\w+),\s+(\w+)\s+(\d+),\s+(\d+)\s+at\s+(\d+):(\d+)\s+(AM|PM)/i);
                      if (match) {
                        const [, , monthName, day, year, hour, minute, ampm] = match;
                        const month = monthMap[monthName.toLowerCase()];
                        if (month !== undefined) {
                          const hour24 = convertTo24Hour(hour, ampm);
                          tradeDate = new Date(parseInt(year), month, parseInt(day), hour24, parseInt(minute));
                        } else {
                          return;
                        }
                      }
                      else if ((match = timestampStr.match(/Yesterday at (\d+):(\d+)\s+(AM|PM)/i))) {
                        const [, hour, minute, ampm] = match;
                        const hour24 = convertTo24Hour(hour, ampm);
                        const yesterday = new Date(todayDate);
                        yesterday.setDate(yesterday.getDate() - 1);
                        tradeDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), hour24, parseInt(minute));
                      }
                      else if ((match = timestampStr.match(/(\d+):(\d+)\s+(AM|PM)/i))) {
                        const [, hour, minute, ampm] = match;
                        const hour24 = convertTo24Hour(hour, ampm);
                        tradeDate = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate(), hour24, parseInt(minute));
                      }
                      else {
                        return;
                      }
                      
                      tradeDate.setHours(0, 0, 0, 0);
                      
                      if (tradeDate >= currentWeekStart) {
                        const strike = trade.strike;
                        if (!strikeVolumes.has(strike)) {
                          strikeVolumes.set(strike, { volume: 0, callVolume: 0, putVolume: 0 });
                        }
                        const volumes = strikeVolumes.get(strike)!;
                        volumes.volume += trade.volume;
                        if (trade.optionType === 'Call') {
                          volumes.callVolume += trade.volume;
                        } else {
                          volumes.putVolume += trade.volume;
                        }
                      }
                    } catch (error) {
                      // Skip this trade
                    }
                  });
                  
                  // Sort by volume and get top 3
                  const topStrikes = Array.from(strikeVolumes.entries())
                    .sort((a, b) => b[1].volume - a[1].volume)
                    .slice(0, 3);
                  
                  if (topStrikes.length > 0) {
                    return (
                      <div className="ticker-analytics">
                        <div className="analytics-badge key-levels-badge">
                          <Target size={12} />
                          <span className="badge-label">Top Strikes (This Week):</span>
                          <span className="badge-strikes">
                            {topStrikes.map(([strike, volumes], idx) => (
                              <span 
                                key={strike} 
                                className="level-strike level-high"
                                title={`Strike: ${strike}, Vol: ${formatVolume(volumes.volume)}, Calls: ${formatVolume(volumes.callVolume)}, Puts: ${formatVolume(volumes.putVolume)}`}
                              >
                                {idx > 0 && ', '}${strike} (${formatVolume(volumes.volume)})
                              </span>
                            ))}
                          </span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}
                
                {/* Last Trade Section - Moved to bottom */}
                {ticker.lastTrade && (
                  <div className="detail-row last-trade-row">
                    <span className="detail-label">Last Trade:</span>
                    <span className="detail-value last-trade">
                      {ticker.lastTrade.optionType} ${ticker.lastTrade.strike} 
                      <span className={`trade-side ${ticker.lastTrade.optionType.toLowerCase()}`}>
                        {ticker.lastTrade.optionType === 'Call' ? '↗' : '↘'}
                      </span>
                      {formatVolume(ticker.lastTrade.volume)}
                      <span className="trade-timestamp">
                        {formatDateTime(ticker.lastTrade.timestamp)}
                      </span>
                    </span>
                  </div>
                )}
          </div>
          );
        })}
      </div>
    </div>
  );
});

TickerList.displayName = 'TickerList';

export default TickerList;
