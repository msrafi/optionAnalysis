import React, { memo, useMemo, useCallback, useState } from 'react';
import { VolumeProfileData, HighestVolumeData, formatVolume, OptionData } from '../utils/dataParser';

export interface VolumeProfileChartProps {
  data: VolumeProfileData[];
  highestVolumeData: HighestVolumeData | null;
  ticker: string;
  expiry?: string;
  chartType: 'callput' | 'total';
  currentPrice?: number; // Optional current stock price
  trades?: OptionData[]; // Raw trade data for tooltips
}

const VolumeProfileChart = memo<VolumeProfileChartProps>(({ 
  data, 
  highestVolumeData,
  ticker, 
  expiry,
  chartType,
  currentPrice,
  trades = []
}) => {
  // Tooltip state
  const [tooltip, setTooltip] = useState<{
    visible: boolean;
    x: number;
    y: number;
    content: {
      strike: number;
      type?: 'Call' | 'Put';
      volume: number;
      trades: number;
      premium: string;
      premiumFull: string;
      sweepTypes: string[];
      tradeVolumes: number[];
    } | null;
  }>({
    visible: false,
    x: 0,
    y: 0,
    content: null
  });

  const getBarWidth = useCallback((volume: number, maxVolume: number) => {
    if (maxVolume === 0) return 0;
    // Scale to 46% of available space (48% total - 2% spacing on each side)
    // This ensures bars don't exceed the available space with the new spacing
    return Math.min((volume / maxVolume) * 46, 46);
  }, []);

  // Build tooltip data for a strike price and option type
  const getTooltipData = useCallback((strike: number, optionType?: 'Call' | 'Put') => {
    const strikeTrades = trades.filter(t => 
      t.strike === strike && (!optionType || t.optionType === optionType)
    );
    
    const totalVolume = strikeTrades.reduce((sum, t) => sum + t.volume, 0);
    const totalPremium = strikeTrades.reduce((sum, t) => {
      const premium = t.premium.replace(/[$,]/g, '');
      return sum + (parseFloat(premium) || 0);
    }, 0);
    
    const premiumFormatted = totalPremium >= 1000000 
      ? (totalPremium / 1000000).toFixed(2) + 'M' 
      : totalPremium >= 1000 
      ? (totalPremium / 1000).toFixed(1) + 'K' 
      : totalPremium.toFixed(0);
    
    // Full premium value with commas
    const premiumFull = totalPremium.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
    
    const sweepTypes = [...new Set(strikeTrades.map(t => t.sweepType))].filter(Boolean);
    
    // Get individual trade volumes, sorted by volume descending
    const tradeVolumes = strikeTrades
      .map(t => t.volume)
      .sort((a, b) => b - a)
      .slice(0, 5); // Show up to 5 largest trades
    
    return {
      strike,
      type: optionType,
      volume: totalVolume,
      trades: strikeTrades.length,
      premium: premiumFormatted,
      premiumFull,
      sweepTypes,
      tradeVolumes
    };
  }, [trades]);

  // Handle mouse enter on volume bar
  const handleBarMouseEnter = useCallback((e: React.MouseEvent, strike: number, optionType?: 'Call' | 'Put') => {
    const rect = e.currentTarget.getBoundingClientRect();
    const tooltipData = getTooltipData(strike, optionType);
    
    setTooltip({
      visible: true,
      x: e.clientX,
      y: rect.top - 10,
      content: tooltipData
    });
  }, [getTooltipData]);

  // Handle mouse leave
  const handleBarMouseLeave = useCallback(() => {
    setTooltip(prev => ({ ...prev, visible: false }));
  }, []);

  // Handle mouse move to update position
  const handleBarMouseMove = useCallback((e: React.MouseEvent) => {
    setTooltip(prev => ({
      ...prev,
      x: e.clientX,
    }));
  }, []);

  // Determine current price - use provided currentPrice or fall back to highest volume strike
  const getCurrentPrice = useCallback(() => {
    return currentPrice || (highestVolumeData?.strike || null);
  }, [currentPrice, highestVolumeData]);

  // Check if a strike price is the current price
  const isCurrentPrice = useCallback((strike: number) => {
    const current = getCurrentPrice();
    return current !== null && Math.abs(strike - current) < 0.01; // Allow for small floating point differences
  }, [getCurrentPrice]);

  // Show all strike prices (no filtering)
  const getFilteredData = useCallback(() => {
    return data
      .sort((a, b) => a.strike - b.strike); // Sort in ascending order (lowest to highest)
  }, [data]);

  // Get chart data for filtered range
  const filteredData = getFilteredData();
  const filteredChartData = useMemo(() => {
    if (!filteredData.length) return { maxVolume: 0, minStrike: 0, maxStrike: 0, maxTotalVolume: 0, totalVolumeSum: 0 };
    
    let maxVolume = 0;
    let maxTotalVolume = 0;
    let minStrike = Infinity;
    let maxStrike = -Infinity;
    let totalVolumeSum = 0;
    
    for (let i = 0; i < filteredData.length; i++) {
      const d = filteredData[i];
      maxVolume = Math.max(maxVolume, Math.max(d.callVolume, d.putVolume));
      maxTotalVolume = Math.max(maxTotalVolume, d.totalVolume);
      minStrike = Math.min(minStrike, d.strike);
      maxStrike = Math.max(maxStrike, d.strike);
      totalVolumeSum += d.totalVolume;
    }
    
    return { 
      maxVolume, 
      minStrike: minStrike === Infinity ? 0 : minStrike, 
      maxStrike: maxStrike === -Infinity ? 0 : maxStrike, 
      maxTotalVolume,
      totalVolumeSum
    };
  }, [filteredData]);

  const getStrikePosition = useCallback((strike: number) => {
    if (!filteredData.length) return 50;
    if (filteredChartData.maxStrike === filteredChartData.minStrike) return 50;
    
    // Calculate position based on index in filtered data for even spacing
    const index = filteredData.findIndex(item => item.strike === strike);
    if (index === -1) return 50;
    
    const totalItems = filteredData.length;
    const spacing = 100 / (totalItems + 1); // Even spacing with padding
    
    // For Call/Put chart: reverse positioning (lowest at top)
    // For Total Volume chart: normal positioning (lowest at left)
    if (chartType === 'callput') {
      const reversedIndex = totalItems - 1 - index;
      return spacing * (reversedIndex + 1);
    } else {
      // Total Volume chart: prices go from low to high (left to right)
      return spacing * (index + 1);
    }
  }, [filteredData, filteredChartData, chartType]);

  // Get position for current price (interpolates between strikes)
  const getCurrentPricePosition = useCallback((price: number) => {
    if (!filteredData.length) return 50;
    if (filteredChartData.maxStrike === filteredChartData.minStrike) return 50;
    
    const minStrike = filteredChartData.minStrike;
    const maxStrike = filteredChartData.maxStrike;
    
    // Clamp price to be within strike range
    const clampedPrice = Math.max(minStrike, Math.min(maxStrike, price));
    
    // Find the strikes immediately above and below the current price
    let lowerStrike = minStrike;
    let upperStrike = maxStrike;
    let lowerIndex = 0;
    let upperIndex = filteredData.length - 1;
    
    for (let i = 0; i < filteredData.length - 1; i++) {
      const currentStrike = filteredData[i].strike;
      const nextStrike = filteredData[i + 1].strike;
      
      if (currentStrike <= clampedPrice && clampedPrice <= nextStrike) {
        lowerStrike = currentStrike;
        upperStrike = nextStrike;
        lowerIndex = i;
        upperIndex = i + 1;
        break;
      }
    }
    
    // Calculate positions for the bounding strikes using same logic as getStrikePosition
    const totalItems = filteredData.length;
    const spacing = 100 / (totalItems + 1);
    
    let lowerPos, upperPos;
    if (chartType === 'callput') {
      // Reversed positioning for call/put chart
      const lowerReversed = totalItems - 1 - lowerIndex;
      const upperReversed = totalItems - 1 - upperIndex;
      lowerPos = spacing * (lowerReversed + 1);
      upperPos = spacing * (upperReversed + 1);
    } else {
      lowerPos = spacing * (lowerIndex + 1);
      upperPos = spacing * (upperIndex + 1);
    }
    
    // Interpolate between the two strike positions
    if (upperStrike === lowerStrike) {
      return lowerPos;
    }
    
    const priceRatio = (clampedPrice - lowerStrike) / (upperStrike - lowerStrike);
    const interpolatedPosition = lowerPos + (upperPos - lowerPos) * priceRatio;
    
    if (import.meta.env.DEV) {
      console.log('Price interpolation:', {
        price: clampedPrice,
        lowerStrike,
        upperStrike,
        lowerPos: lowerPos.toFixed(2),
        upperPos: upperPos.toFixed(2),
        priceRatio: priceRatio.toFixed(3),
        finalPos: interpolatedPosition.toFixed(2)
      });
    }
    
    return interpolatedPosition;
  }, [filteredData, filteredChartData, chartType]);

  // Calculate dynamic height based on number of strike prices
  const getChartHeight = useCallback(() => {
    const rowHeight = 18; // Height of each strike row
    const minHeight = 400; // Minimum chart height
    const calculatedHeight = Math.max(minHeight, filteredData.length * rowHeight + 40); // 40px padding
    return calculatedHeight;
  }, [filteredData.length]);

  if (!data.length) {
    return (
      <div className="volume-profile-chart">
        <div className="chart-header">
          <h3>{ticker} {chartType === 'callput' ? 'Call/Put Volume' : 'Total Volume'}</h3>
          {expiry && <span className="expiry-date">{expiry}</span>}
        </div>
        <div className="no-data">
          <p>No volume data available for this ticker{expiry ? ` and expiry date` : ''}</p>
        </div>
      </div>
    );
  }

  if (chartType === 'callput') {
    return (
      <>
      <div className="volume-profile-chart modern-mirrored-chart">
        <div className="chart-header modern-header">
          <h3>{ticker} Call/Put Volume</h3>
          <div className="header-info">
            {getCurrentPrice() && (
              <span className="current-price-display">
                Current Price: <strong>${getCurrentPrice()}</strong>
              </span>
            )}
            {expiry && <span className="expiry-date">{expiry}</span>}
          </div>
        </div>
        
        <div className="chart-container modern-container">
          
          {/* Main Chart Area */}
          <div 
            className="chart-area modern-chart-area"
            style={{ height: `${getChartHeight()}px` }}
          >
            {/* Center Line */}
            <div className="center-line"></div>
            
            {/* Strike Price Lines */}
            <div className="strike-axis modern-strike-axis">
              {filteredData.map((item) => (
                <div 
                  key={item.strike} 
                  className="strike-line modern-strike-line"
                  style={{ 
                    top: `${getStrikePosition(item.strike)}%`
                  }}
                >
                  <span 
                    className={`strike-label modern-strike-label ${isCurrentPrice(item.strike) ? 'current-price-label' : ''}`}
                  >
                    {item.strike}
                  </span>
                </div>
              ))}
            </div>
            
            {/* Call/Put Volume Bars */}
            <div className="volume-bars modern-volume-bars">
              {filteredData.map((item) => (
                <div 
                  key={item.strike} 
                  className="strike-row modern-strike-row"
                  style={{ top: `${getStrikePosition(item.strike)}%` }}
                >
                  {/* Call volume bar (left side, green) */}
                  <div 
                    className="volume-bar call-bar modern-call-bar"
                    style={{ 
                      width: `${getBarWidth(item.callVolume, filteredChartData.maxVolume)}%`,
                      right: '52%' /* Moved 2% away from center to add spacing */
                    }}
                    onMouseEnter={(e) => handleBarMouseEnter(e, item.strike, 'Call')}
                    onMouseLeave={handleBarMouseLeave}
                    onMouseMove={handleBarMouseMove}
                  >
                    {item.callVolume > 0 && getBarWidth(item.callVolume, filteredChartData.maxVolume) > 12 && (
                      <span className="volume-text modern-volume-text">
                        {formatVolume(item.callVolume)}
                      </span>
                    )}
                  </div>
                  
                  {/* Put volume bar (right side, red) */}
                  <div 
                    className="volume-bar put-bar modern-put-bar"
                    style={{ 
                      width: `${getBarWidth(item.putVolume, filteredChartData.maxVolume)}%`,
                      left: '52%' /* Moved 2% away from center to add spacing */
                    }}
                    onMouseEnter={(e) => handleBarMouseEnter(e, item.strike, 'Put')}
                    onMouseLeave={handleBarMouseLeave}
                    onMouseMove={handleBarMouseMove}
                  >
                    {item.putVolume > 0 && getBarWidth(item.putVolume, filteredChartData.maxVolume) > 12 && (
                      <span className="volume-text modern-volume-text">
                        {formatVolume(item.putVolume)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            
            {/* Current Price Indicator Line */}
            {getCurrentPrice() && (
              <div 
                className="current-price-line"
                style={{ 
                  top: `${getCurrentPricePosition(getCurrentPrice()!)}%`
                }}
              >
                <span className="current-price-label-inline" style={{
                  position: 'absolute',
                  left: '105%',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'linear-gradient(135deg, rgba(255, 193, 7, 0.95), rgba(255, 152, 0, 0.95))',
                  color: '#000000',
                  padding: '0.25rem 0.5rem',
                  borderRadius: '4px',
                  fontSize: '0.8rem',
                  fontWeight: '700',
                  whiteSpace: 'nowrap',
                  border: '2px solid rgba(255, 193, 7, 1)',
                  boxShadow: '0 2px 8px rgba(255, 193, 7, 0.4)',
                  zIndex: 15
                }}>
                  ${getCurrentPrice()!.toFixed(2)}
                </span>
              </div>
            )}
          </div>
        </div>
        
        {/* Legend */}
        {/* <div className="chart-legend modern-legend">
          <div className="legend-item">
            <div className="legend-color call modern-legend-call"></div>
            <span>Call Volume</span>
          </div>
          <div className="legend-item">
            <div className="legend-color put modern-legend-put"></div>
            <span>Put Volume</span>
          </div>
        </div> */}
      </div>

      {/* Modern Tooltip */}
      {tooltip.visible && tooltip.content && (
        <div 
          className="modern-tooltip"
          style={{
            position: 'fixed',
            left: `${tooltip.x + 15}px`,
            top: `${tooltip.y}px`,
            transform: 'translateY(-50%)',
            pointerEvents: 'none',
            zIndex: 9999
          }}
        >
          <div className="tooltip-header">
            <span className="tooltip-strike">${tooltip.content.strike}</span>
            {tooltip.content.type && (
              <span className={`tooltip-type ${tooltip.content.type.toLowerCase()}`}>
                {tooltip.content.type}
              </span>
            )}
          </div>
          <div className="tooltip-body">
            <div className="tooltip-row">
              <span className="tooltip-label">Volume:</span>
              <span className="tooltip-value">{tooltip.content.volume.toLocaleString()}</span>
            </div>
            <div className="tooltip-row">
              <span className="tooltip-label">Trades:</span>
              <span className="tooltip-value">{tooltip.content.trades}</span>
            </div>
            {tooltip.content.tradeVolumes.length > 0 && (
              <div className="tooltip-row">
                <span className="tooltip-label">Top Trades:</span>
                <span className="tooltip-value tooltip-trades">{tooltip.content.tradeVolumes.map(v => v.toLocaleString()).join(' • ')}</span>
              </div>
            )}
          </div>
        </div>
      )}
      </>
    );
  }

  // Total Volume Chart (Vertical orientation)
  return (
    <>
    <div className="volume-profile-chart total-chart">
      <div className="chart-header">
        <h3>{ticker} Total Volume</h3>
        <div className="header-info">
          {getCurrentPrice() && (
            <span className="current-price-display">
              Current Price: <strong>${getCurrentPrice()}</strong>
            </span>
          )}
          {expiry && <span className="expiry-date">{expiry}</span>}
        </div>
      </div>
      
      {/* Chart Header with Price Info */}
      {/* <div className="chart-header">
        <div className="chart-title">
          {ticker} Total Volume
        </div>
        <div className="price-info">
          <div className="current-price-box">
            Current Price: ${getCurrentPrice()?.toFixed(2) || 'N/A'}
          </div>
          <div className="price-range-box">
            Range: ${filteredData.length > 0 ? filteredData[0].strike.toFixed(0) : 'N/A'} - ${filteredData.length > 0 ? filteredData[filteredData.length - 1].strike.toFixed(0) : 'N/A'}
          </div>
        </div>
      </div> */}

      <div className="chart-container vertical">
        
        {/* Main Chart Area */}
        <div 
          className="chart-area vertical"
          style={{ height: `${getChartHeight()}px` }}
        >
          {/* Total Volume Bars (Vertical) */}
          <div className="volume-bars vertical">
            {filteredData.map((item) => (
              <div 
                key={item.strike} 
                className="strike-column"
                style={{ left: `${getStrikePosition(item.strike)}%` }}
              >
                <div 
                  className="volume-bar total-bar vertical"
                  style={{ 
                    height: `${getBarWidth(item.totalVolume, filteredChartData.maxTotalVolume)}%`
                  }}
                  onMouseEnter={(e) => handleBarMouseEnter(e, item.strike)}
                  onMouseLeave={handleBarMouseLeave}
                  onMouseMove={handleBarMouseMove}
                >
                  {item.totalVolume > 0 && (
                    <span className="volume-text volume-text-top">
                      {formatVolume(item.totalVolume)}
                      <span className="volume-percentage">
                        ({filteredChartData.totalVolumeSum > 0 ? ((item.totalVolume / filteredChartData.totalVolumeSum) * 100).toFixed(1) : '0.0'}%)
                      </span>
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
          
          {/* Current Price Indicator Line (Vertical) */}
          {getCurrentPrice() && (
            <div 
              className="current-price-line vertical"
              style={{ 
                left: `${getCurrentPricePosition(getCurrentPrice()!)}%`
              }}
            >
              <span className="current-price-label-inline" style={{
                position: 'absolute',
                left: '50%',
                top: '-30px',
                transform: 'translateX(-50%)',
                background: 'linear-gradient(135deg, rgba(255, 193, 7, 0.95), rgba(255, 152, 0, 0.95))',
                color: '#000000',
                padding: '0.25rem 0.5rem',
                borderRadius: '4px',
                fontSize: '0.8rem',
                fontWeight: '700',
                whiteSpace: 'nowrap',
                border: '2px solid rgba(255, 193, 7, 1)',
                boxShadow: '0 2px 8px rgba(255, 193, 7, 0.4)',
                zIndex: 15
              }}>
                ${getCurrentPrice()!.toFixed(2)}
              </span>
            </div>
          )}
        </div>
        
        {/* X-Axis Price Labels (Bottom) - Moved outside chart area */}
        <div className="x-axis-labels">
          {filteredData.map((item) => (
            <div 
              key={item.strike} 
              className="x-axis-label"
              style={{ 
                left: `${getStrikePosition(item.strike)}%`
              }}
            >
              <span 
                className={`strike-label ${isCurrentPrice(item.strike) ? 'current-price-label' : ''}`}
              >
                {item.strike}
              </span>
            </div>
          ))}
        </div>
      </div>
      
      {/* Legend */}
      {/* <div className="chart-legend">
        <div className="legend-item">
          <div className="legend-color total"></div>
          <span>Total Volume</span>
        </div>
      </div> */}

      {/* Modern Tooltip */}
      {tooltip.visible && tooltip.content && (
        <div 
          className="modern-tooltip"
          style={{
            position: 'fixed',
            left: `${tooltip.x + 15}px`,
            top: `${tooltip.y}px`,
            transform: 'translateY(-50%)',
            pointerEvents: 'none',
            zIndex: 9999
          }}
        >
          <div className="tooltip-header">
            <span className="tooltip-strike">${tooltip.content.strike}</span>
            {tooltip.content.type && (
              <span className={`tooltip-type ${tooltip.content.type.toLowerCase()}`}>
                {tooltip.content.type}
              </span>
            )}
          </div>
          <div className="tooltip-body">
            <div className="tooltip-row">
              <span className="tooltip-label">Volume:</span>
              <span className="tooltip-value">{tooltip.content.volume.toLocaleString()}</span>
            </div>
            <div className="tooltip-row">
              <span className="tooltip-label">Trades:</span>
              <span className="tooltip-value">{tooltip.content.trades}</span>
            </div>
            {tooltip.content.tradeVolumes.length > 0 && (
              <div className="tooltip-row">
                <span className="tooltip-label">Top Trades:</span>
                <span className="tooltip-value tooltip-trades">{tooltip.content.tradeVolumes.map(v => v.toLocaleString()).join(' • ')}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
    </>
  );
});

VolumeProfileChart.displayName = 'VolumeProfileChart';

export default VolumeProfileChart;
