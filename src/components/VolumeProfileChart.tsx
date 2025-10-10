import React, { memo, useMemo, useCallback } from 'react';
import { VolumeProfileData, HighestVolumeData, formatVolume } from '../utils/dataParser';

interface VolumeProfileChartProps {
  data: VolumeProfileData[];
  highestVolumeData: HighestVolumeData | null;
  ticker: string;
  expiry?: string;
  chartType: 'callput' | 'total';
}

const VolumeProfileChart: React.FC<VolumeProfileChartProps> = memo(({ 
  data, 
  highestVolumeData,
  ticker, 
  expiry,
  chartType
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
    // Scale to 80% of available space to prevent overflow
    return Math.min((volume / maxVolume) * 80, 80);
  }, []);

  const getStrikePosition = useCallback((strike: number) => {
    if (chartData.maxStrike === chartData.minStrike) return 50;
    return ((strike - chartData.minStrike) / (chartData.maxStrike - chartData.minStrike)) * 100;
  }, [chartData.maxStrike, chartData.minStrike]);

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
      <div className="volume-profile-chart callput-chart">
        <div className="chart-header">
          <h3>{ticker} Call/Put Volume</h3>
          {expiry && <span className="expiry-date">{expiry}</span>}
        </div>
        
        <div className="chart-container">
          {/* Left Volume Axis */}
          <div className="volume-axis-left">
            <div className="volume-label">{formatVolume(chartData.maxVolume)}</div>
            <div className="volume-label">{formatVolume(chartData.maxVolume / 2)}</div>
            <div className="volume-label">0</div>
            <div className="volume-label">-{formatVolume(chartData.maxVolume / 2)}</div>
            <div className="volume-label">-{formatVolume(chartData.maxVolume)}</div>
          </div>
          
          {/* Main Chart Area */}
          <div className="chart-area">
            {/* Strike Price Lines */}
            <div className="strike-axis">
              {data.map((item) => (
                <div 
                  key={item.strike} 
                  className="strike-line"
                  style={{ 
                    top: `${getStrikePosition(item.strike)}%`
                  }}
                >
                  <span className="strike-label">{item.strike}</span>
                </div>
              ))}
            </div>
            
            {/* Call/Put Volume Bars */}
            <div className="volume-bars">
              {data.map((item) => (
                <div 
                  key={item.strike} 
                  className="strike-row"
                  style={{ top: `${getStrikePosition(item.strike)}%` }}
                >
                  {/* Call volume bar (left side, green) */}
                  <div 
                    className="volume-bar call-bar"
                    style={{ 
                      width: `${getBarWidth(item.callVolume, chartData.maxVolume)}%`,
                      right: '50%'
                    }}
                  >
                    {item.callVolume > 0 && (
                      <span className="volume-text">
                        {formatVolume(item.callVolume)}
                      </span>
                    )}
                  </div>
                  
                  {/* Put volume bar (right side, red) */}
                  <div 
                    className="volume-bar put-bar"
                    style={{ 
                      width: `${getBarWidth(item.putVolume, chartData.maxVolume)}%`,
                      left: '50%'
                    }}
                  >
                    {item.putVolume > 0 && (
                      <span className="volume-text">
                        {formatVolume(item.putVolume)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            
            {/* Highest Volume Indicator Line */}
            {highestVolumeData && (
              <div 
                className="highest-volume-line"
                style={{ 
                  top: `${getStrikePosition(highestVolumeData.strike)}%`
                }}
              >
                <div className="highest-volume-label">
                  <span className="ticker-price">{ticker} Price {highestVolumeData.strike}</span>
                  <span className="plus-icon">+</span>
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* Legend */}
        <div className="chart-legend">
          <div className="legend-item">
            <div className="legend-color call"></div>
            <span>Call Volume</span>
          </div>
          <div className="legend-item">
            <div className="legend-color put"></div>
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
        {expiry && <span className="expiry-date">{expiry}</span>}
      </div>
      
      <div className="chart-container vertical">
        {/* Bottom Volume Axis */}
        <div className="volume-axis-bottom">
          <div className="volume-label">0</div>
          <div className="volume-label">{formatVolume(chartData.maxTotalVolume * 0.25)}</div>
          <div className="volume-label">{formatVolume(chartData.maxTotalVolume * 0.5)}</div>
          <div className="volume-label">{formatVolume(chartData.maxTotalVolume * 0.75)}</div>
          <div className="volume-label">{formatVolume(chartData.maxTotalVolume)}</div>
        </div>
        
        {/* Main Chart Area */}
        <div className="chart-area vertical">
          {/* Strike Price Lines (Vertical) */}
          <div className="strike-axis vertical">
            {data.map((item) => (
              <div 
                key={item.strike} 
                className="strike-line vertical"
                style={{ 
                  left: `${getStrikePosition(item.strike)}%`
                }}
              >
                <span className="strike-label">{item.strike}</span>
              </div>
            ))}
          </div>
          
          {/* Total Volume Bars (Vertical) */}
          <div className="volume-bars vertical">
            {data.map((item) => (
              <div 
                key={item.strike} 
                className="strike-column"
                style={{ left: `${getStrikePosition(item.strike)}%` }}
              >
                <div 
                  className="volume-bar total-bar vertical"
                  style={{ 
                    height: `${getBarWidth(item.totalVolume, chartData.maxTotalVolume)}%`
                  }}
                >
                  {item.totalVolume > 0 && (
                    <span className="volume-text">
                      {formatVolume(item.totalVolume)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
          
          {/* Highest Volume Indicator Line (Vertical) */}
          {highestVolumeData && (
            <div 
              className="highest-volume-line vertical"
              style={{ 
                left: `${getStrikePosition(highestVolumeData.strike)}%`
              }}
            >
              <div className="highest-volume-label vertical">
                <span className="ticker-price">{ticker} Price {highestVolumeData.strike}</span>
                <span className="plus-icon">+</span>
              </div>
            </div>
          )}
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
