import React, { useMemo, useState } from 'react';
import { OptionData } from '../utils/dataParser';

// Import the parsePremium function from dataParser
function parsePremium(premium: string): number {
  const hasK = premium.includes('K');
  const hasM = premium.includes('M');
  
  const cleanPremium = premium.replace(/[$,]/g, '');
  const num = parseFloat(cleanPremium);
  
  if (hasM) {
    return num * 1000000;
  } else if (hasK) {
    return num * 1000;
  }
  
  return num;
}

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
  const [tooltip, setTooltip] = useState<{
    visible: boolean;
    x: number;
    y: number;
    content: {
      strike: number;
      expiry: string;
      netPremium: string;
      volume: number;
      callVolume: number;
      putVolume: number;
      trades: number;
    } | null;
  }>({
    visible: false,
    x: 0,
    y: 0,
    content: null
  });

  const handleCellMouseEnter = (e: React.MouseEvent, cell: HeatmapCell, strike: number, expiry: string) => {
    if (cell && cell.volume > 0) {
      const rect = e.currentTarget.getBoundingClientRect();
      setTooltip({
        visible: true,
        x: rect.left,
        y: rect.top + rect.height / 2,
        content: {
          strike,
          expiry,
          netPremium: formatValue(cell.value),
          volume: cell.volume,
          callVolume: cell.callVolume,
          putVolume: cell.putVolume,
          trades: cell.trades
        }
      });
    }
  };

  const handleCellMouseLeave = () => {
    setTooltip(prev => ({ ...prev, visible: false }));
  };

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
      const totalValue = parsePremium(trade.premium);

      // Debug logging for small values
      if (Math.abs(totalValue) < 10 && trade.ticker === 'TSLA') {
        console.log(`Small premium detected: ${trade.ticker} ${trade.strike} ${trade.expiry} ${trade.optionType} - Premium: "${trade.premium}" -> Parsed: ${totalValue}`);
      }

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
    } else if (absValue >= 1) {
      return `${value >= 0 ? '' : '-'}$${absValue.toFixed(0)}`;
    } else {
      // For very small values, show more precision
      return `${value >= 0 ? '' : '-'}$${absValue.toFixed(2)}`;
    }
  };

  const isCurrentPriceStrike = (strike: number): boolean => {
    if (!currentPrice) return false;
    return Math.abs(strike - currentPrice) < 2; // Within $2
  };

  const getCellKey = (strike: number, expiry: string) => `${strike}_${expiry}`;

  // Check if we have any data to display
  const hasData = strikes.length > 0 && expiries.length > 0;

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
        {hasData ? (
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
                          onMouseEnter={hasData ? (e) => handleCellMouseEnter(e, cell!, strike, expiry) : undefined}
                          onMouseLeave={hasData ? handleCellMouseLeave : undefined}
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
        ) : (
          <div className="heatmap-no-data">
            <p>No heatmap data available</p>
            <p>Select a ticker with options data to view the heatmap</p>
          </div>
        )}
      </div>

      {/* Custom Tooltip */}
      {tooltip.visible && tooltip.content && (
        <div 
          className="modern-tooltip heatmap-tooltip"
          style={{
            position: 'fixed',
            left: `${tooltip.x + 15}px`,
            top: `${tooltip.y}px`,
            transform: 'translateY(-50%)',
            pointerEvents: 'auto',
            zIndex: 9999
          }}
          onMouseEnter={() => setTooltip(prev => ({ ...prev, visible: true }))}
          onMouseLeave={handleCellMouseLeave}
        >
          <div className="tooltip-header">
            <span className="tooltip-strike">${tooltip.content.strike}</span>
            <span className={`tooltip-type ${tooltip.content.netPremium.startsWith('-') ? 'put' : 'call'}`}>
              {tooltip.content.netPremium.startsWith('-') ? 'Put' : 'Call'}
            </span>
          </div>
          <div className="tooltip-body">
            <div className="tooltip-row">
              <span className="tooltip-label">Expiry</span>
              <span className="tooltip-value">
                {new Date(tooltip.content.expiry).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric'
                })}
              </span>
            </div>
            <div className="tooltip-row">
              <span className="tooltip-label">Net Premium</span>
              <span className="tooltip-value">{tooltip.content.netPremium}</span>
            </div>
            <div className="tooltip-row">
              <span className="tooltip-label">Total Volume</span>
              <span className="tooltip-value">{tooltip.content.volume.toLocaleString()}</span>
            </div>
            <div className="tooltip-row">
              <span className="tooltip-label">Call Volume</span>
              <span className="tooltip-value" style={{ color: '#66bb6a' }}>
                {tooltip.content.callVolume.toLocaleString()}
              </span>
            </div>
            <div className="tooltip-row">
              <span className="tooltip-label">Put Volume</span>
              <span className="tooltip-value" style={{ color: '#ef5350' }}>
                {tooltip.content.putVolume.toLocaleString()}
              </span>
            </div>
            <div className="tooltip-row">
              <span className="tooltip-label">Trades</span>
              <span className="tooltip-value">{tooltip.content.trades}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StrikeExpiryHeatmap;

