import React, { useMemo } from 'react';
import { OptionData } from '../utils/dataParser';

interface StrikeExpiryHeatmapProps {
  trades: OptionData[];
  currentPrice?: number;
}

interface HeatmapCell {
  value: number;
  volume: number;
  callVolume: number;
  putVolume: number;
  trades: number;
}

const StrikeExpiryHeatmap: React.FC<StrikeExpiryHeatmapProps> = ({ trades, currentPrice }) => {
  const { heatmapData, strikes, expiries, maxAbsValue } = useMemo(() => {
    // Group trades by strike and expiry
    const dataMap = new Map<string, HeatmapCell>();
    const strikeSet = new Set<number>();
    const expirySet = new Set<string>();

    trades.forEach(trade => {
      const key = `${trade.strike}_${trade.expiry}`;
      strikeSet.add(trade.strike);
      expirySet.add(trade.expiry);

      if (!dataMap.has(key)) {
        dataMap.set(key, {
          value: 0,
          volume: 0,
          callVolume: 0,
          putVolume: 0,
          trades: 0
        });
      }

      const cell = dataMap.get(key)!;
      const premium = parseFloat(trade.premium.replace(/[$,K]/g, ''));
      const multiplier = trade.premium.includes('K') ? 1000 : 1;
      const totalValue = premium * multiplier;

      // Aggregate based on option type
      if (trade.optionType === 'Call') {
        cell.value += totalValue;
        cell.callVolume += trade.volume;
      } else {
        cell.value -= totalValue; // Puts are negative
        cell.putVolume += trade.volume;
      }

      cell.volume += trade.volume;
      cell.trades += 1;
    });

    // Sort strikes and expiries
    const sortedStrikes = Array.from(strikeSet).sort((a, b) => b - a); // Descending
    const sortedExpiries = Array.from(expirySet).sort((a, b) => {
      const dateA = new Date(a);
      const dateB = new Date(b);
      return dateA.getTime() - dateB.getTime();
    });

    // Find max absolute value for color scaling
    let maxAbs = 0;
    dataMap.forEach(cell => {
      const absValue = Math.abs(cell.value);
      if (absValue > maxAbs) maxAbs = absValue;
    });

    return {
      heatmapData: dataMap,
      strikes: sortedStrikes,
      expiries: sortedExpiries,
      maxAbsValue: maxAbs
    };
  }, [trades]);

  const getColor = (value: number, volume: number) => {
    if (volume === 0) return 'rgba(255, 255, 255, 0.03)';
    
    const intensity = Math.abs(value) / maxAbsValue;
    const alpha = 0.2 + (intensity * 0.6); // Range from 0.2 to 0.8

    if (value > 0) {
      // Positive (Calls) - Green
      return `rgba(76, 175, 80, ${alpha})`;
    } else {
      // Negative (Puts) - Red
      return `rgba(244, 67, 54, ${alpha})`;
    }
  };

  const formatValue = (value: number): string => {
    const absValue = Math.abs(value);
    if (absValue >= 1000000) {
      return `${value >= 0 ? '' : '-'}$${(absValue / 1000000).toFixed(1)}M`;
    } else if (absValue >= 1000) {
      return `${value >= 0 ? '' : '-'}$${(absValue / 1000).toFixed(1)}K`;
    }
    return `${value >= 0 ? '' : '-'}$${absValue.toFixed(0)}`;
  };

  const isCurrentPriceStrike = (strike: number): boolean => {
    if (!currentPrice) return false;
    return Math.abs(strike - currentPrice) < 2; // Within $2
  };

  const getCellKey = (strike: number, expiry: string) => `${strike}_${expiry}`;

  return (
    <div className="strike-expiry-heatmap">
      <div className="heatmap-header">
        <h3>Strike × Expiry Premium Heatmap</h3>
        <div className="heatmap-legend">
          <div className="legend-item">
            <div className="legend-color" style={{ background: 'rgba(76, 175, 80, 0.6)' }}></div>
            <span>Call Premium</span>
          </div>
          <div className="legend-item">
            <div className="legend-color" style={{ background: 'rgba(244, 67, 54, 0.6)' }}></div>
            <span>Put Premium</span>
          </div>
          {currentPrice && (
            <div className="legend-item">
              <div className="legend-color" style={{ background: 'rgba(255, 193, 7, 0.4)', border: '2px solid #ffc107' }}></div>
              <span>Current Price (~${currentPrice.toFixed(2)})</span>
            </div>
          )}
        </div>
      </div>

      <div className="heatmap-scroll-container">
        <table className="heatmap-table">
          <thead>
            <tr>
              <th className="heatmap-corner">Strike</th>
              {expiries.map(expiry => (
                <th key={expiry} className="heatmap-expiry">
                  {new Date(expiry).toLocaleDateString('en-US', { 
                    month: '2-digit', 
                    day: '2-digit',
                    year: '2-digit'
                  })}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {strikes.map(strike => {
              const isAtMoney = isCurrentPriceStrike(strike);
              return (
                <tr key={strike} className={isAtMoney ? 'current-price-row' : ''}>
                  <td className={`heatmap-strike ${isAtMoney ? 'at-money' : ''}`}>
                    {strike.toFixed(1)}
                    {isAtMoney && <span className="atm-indicator">▶</span>}
                  </td>
                  {expiries.map(expiry => {
                    const cell = heatmapData.get(getCellKey(strike, expiry));
                    const hasData = cell && cell.volume > 0;
                    
                    return (
                      <td
                        key={`${strike}_${expiry}`}
                        className={`heatmap-cell ${hasData ? 'has-data' : ''} ${isAtMoney ? 'at-money-cell' : ''}`}
                        style={{
                          background: hasData ? getColor(cell!.value, cell!.volume) : undefined
                        }}
                        title={hasData ? 
                          `Strike: $${strike}\nExpiry: ${expiry}\nNet Premium: ${formatValue(cell!.value)}\nVolume: ${cell!.volume}\nCalls: ${cell!.callVolume}\nPuts: ${cell!.putVolume}\nTrades: ${cell!.trades}` 
                          : undefined
                        }
                      >
                        {hasData && (
                          <div className="cell-content">
                            <span className="cell-value">{formatValue(cell!.value)}</span>
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default StrikeExpiryHeatmap;

