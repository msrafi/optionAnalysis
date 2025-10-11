import React, { memo, useMemo, useCallback } from 'react';
import { VolumeProfileData, HighestVolumeData, formatVolume } from '../utils/dataParser';

interface VolumeProfileChartProps {
  data: VolumeProfileData[];
  highestVolumeData: HighestVolumeData | null;
  ticker: string;
  expiry?: string;
  chartType: 'callput' | 'total';
  currentPrice?: number; // Optional current stock price
}

const VolumeProfileChart: React.FC<VolumeProfileChartProps> = memo(({ 
  data, 
  highestVolumeData,
  ticker, 
  expiry,
  chartType,
  currentPrice
}) => {
  const chartData = useMemo(() => {
    if (!data.length) return { maxVolume: 0, minStrike: 0, maxStrike: 0, maxTotalVolume: 0 };
    
    // Use for loop for better performance
    let maxVolume = 0;
    let maxTotalVolume = 0;
    let minStrike = Infinity;
    let maxStrike = -Infinity;
    
    for (let i = 0; i < data.length; i++) {
      const d = data[i];
      maxVolume = Math.max(maxVolume, Math.max(d.callVolume, d.putVolume));
      maxTotalVolume = Math.max(maxTotalVolume, d.totalVolume);
      minStrike = Math.min(minStrike, d.strike);
      maxStrike = Math.max(maxStrike, d.strike);
    }
    
    return { 
      maxVolume, 
      minStrike: minStrike === Infinity ? 0 : minStrike, 
      maxStrike: maxStrike === -Infinity ? 0 : maxStrike, 
      maxTotalVolume 
    };
  }, [data]);

  const getBarWidth = useCallback((volume: number, maxVolume: number) => {
    if (maxVolume === 0) return 0;
    // Scale to 46% of available space (48% total - 2% spacing on each side)
    // This ensures bars don't exceed the available space with the new spacing
    return Math.min((volume / maxVolume) * 46, 46);
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

  // Filter data to show only strike prices within 10% range of current price
  const getFilteredData = useCallback(() => {
    const current = getCurrentPrice();
    if (!current) return data;
    
    const range = current * 0.1; // 10% of current price
    const minStrike = current - range;
    const maxStrike = current + range;
    
    return data
      .filter(item => item.strike >= minStrike && item.strike <= maxStrike)
      .sort((a, b) => a.strike - b.strike); // Sort in ascending order (lowest to highest)
  }, [data, getCurrentPrice]);

  // Get chart data for filtered range
  const filteredData = getFilteredData();
  const filteredChartData = useMemo(() => {
    if (!filteredData.length) return { maxVolume: 0, minStrike: 0, maxStrike: 0, maxTotalVolume: 0 };
    
    let maxVolume = 0;
    let maxTotalVolume = 0;
    let minStrike = Infinity;
    let maxStrike = -Infinity;
    
    for (let i = 0; i < filteredData.length; i++) {
      const d = filteredData[i];
      maxVolume = Math.max(maxVolume, Math.max(d.callVolume, d.putVolume));
      maxTotalVolume = Math.max(maxTotalVolume, d.totalVolume);
      minStrike = Math.min(minStrike, d.strike);
      maxStrike = Math.max(maxStrike, d.strike);
    }
    
    return { 
      maxVolume, 
      minStrike: minStrike === Infinity ? 0 : minStrike, 
      maxStrike: maxStrike === -Infinity ? 0 : maxStrike, 
      maxTotalVolume 
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
      <div className="volume-profile-chart modern-mirrored-chart">
        <div className="chart-header modern-header">
          <h3>{ticker} Call/Put Volume</h3>
          <div className="header-info">
            {getCurrentPrice() && (
              <>
                <span className="current-price-display">
                  Current Price: <strong>${getCurrentPrice()}</strong>
                </span>
                <span className="price-range-display">
                  Range: <strong>${(getCurrentPrice()! * 0.9).toFixed(0)} - ${(getCurrentPrice()! * 1.1).toFixed(0)}</strong>
                </span>
              </>
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
                    title={`Call Volume: ${formatVolume(item.callVolume)} at Strike ${item.strike}`}
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
                    title={`Put Volume: ${formatVolume(item.putVolume)} at Strike ${item.strike}`}
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
                  top: `${getStrikePosition(getCurrentPrice()!)}%`
                }}
              ></div>
            )}
          </div>
        </div>
        
        {/* Legend */}
        <div className="chart-legend modern-legend">
          <div className="legend-item">
            <div className="legend-color call modern-legend-call"></div>
            <span>Call Volume</span>
          </div>
          <div className="legend-item">
            <div className="legend-color put modern-legend-put"></div>
            <span>Put Volume</span>
          </div>
        </div>
      </div>
    );
  }

  // Total Volume Chart (Vertical orientation)
  return (
    <div className="volume-profile-chart total-chart">
      <div className="chart-header">
        <h3>{ticker} Total Volume</h3>
        <div className="header-info">
          {getCurrentPrice() && (
            <>
              <span className="current-price-display">
                Current Price: <strong>${getCurrentPrice()}</strong>
              </span>
              <span className="price-range-display">
                Range: <strong>${(getCurrentPrice()! * 0.9).toFixed(0)} - ${(getCurrentPrice()! * 1.1).toFixed(0)}</strong>
              </span>
            </>
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
                >
                  {item.totalVolume > 0 && (
                    <span className="volume-text volume-text-top">
                      {formatVolume(item.totalVolume)}
                      <span className="volume-percentage">
                        ({((item.totalVolume / filteredData.reduce((sum, d) => sum + d.totalVolume, 0)) * 100).toFixed(1)}%)
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
                left: `${getStrikePosition(getCurrentPrice()!)}%`
              }}
            ></div>
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
      <div className="chart-legend">
        <div className="legend-item">
          <div className="legend-color total"></div>
          <span>Total Volume</span>
        </div>
      </div>
    </div>
  );
});

VolumeProfileChart.displayName = 'VolumeProfileChart';

export default VolumeProfileChart;
