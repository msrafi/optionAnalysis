import React, { useMemo } from 'react';
import { VolumeProfileData, formatVolume } from '../utils/dataParser';

interface VolumeProfileChartProps {
  data: VolumeProfileData[];
  ticker: string;
  expiry?: string;
}

const VolumeProfileChart: React.FC<VolumeProfileChartProps> = ({ 
  data, 
  ticker, 
  expiry 
}) => {
  const chartData = useMemo(() => {
    if (!data.length) return { maxVolume: 0, minStrike: 0, maxStrike: 0 };
    
    const maxVolume = Math.max(...data.map(d => Math.max(d.callVolume, d.putVolume)));
    const strikes = data.map(d => d.strike);
    const minStrike = Math.min(...strikes);
    const maxStrike = Math.max(...strikes);
    
    return { maxVolume, minStrike, maxStrike };
  }, [data]);

  const getBarWidth = (volume: number) => {
    if (chartData.maxVolume === 0) return 0;
    return (volume / chartData.maxVolume) * 100;
  };

  const getStrikePosition = (strike: number) => {
    if (chartData.maxStrike === chartData.minStrike) return 50;
    return ((strike - chartData.minStrike) / (chartData.maxStrike - chartData.minStrike)) * 100;
  };

  if (!data.length) {
    return (
      <div className="volume-profile-chart">
        <div className="chart-header">
          <h3>{ticker} Volume Profile</h3>
          {expiry && <span className="expiry-date">{expiry}</span>}
        </div>
        <div className="no-data">
          <p>No volume data available for this ticker{expiry ? ` and expiry date` : ''}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="volume-profile-chart">
      <div className="chart-header">
        <h3>{ticker} Volume Profile</h3>
        {expiry && <span className="expiry-date">{expiry}</span>}
      </div>
      
      <div className="chart-container">
        {/* Volume axis labels */}
        <div className="volume-axis">
          <div className="volume-label">{formatVolume(chartData.maxVolume)}</div>
          <div className="volume-label">{formatVolume(chartData.maxVolume / 2)}</div>
          <div className="volume-label">0</div>
          <div className="volume-label">-{formatVolume(chartData.maxVolume / 2)}</div>
          <div className="volume-label">-{formatVolume(chartData.maxVolume)}</div>
        </div>
        
        {/* Chart area */}
        <div className="chart-area">
          {/* Strike price axis */}
          <div className="strike-axis">
            {data.map((item) => (
              <div 
                key={item.strike} 
                className="strike-line"
                style={{ 
                  top: `${getStrikePosition(item.strike)}%`,
                  left: '50%',
                  transform: 'translateX(-50%)'
                }}
              >
                <span className="strike-label">{item.strike}</span>
              </div>
            ))}
          </div>
          
          {/* Volume bars */}
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
                    width: `${getBarWidth(item.callVolume)}%`,
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
                    width: `${getBarWidth(item.putVolume)}%`,
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
          
          {/* Open Interest bars (right side, blue) */}
          <div className="open-interest-bars">
            {data.map((item) => (
              <div 
                key={`oi-${item.strike}`} 
                className="oi-bar"
                style={{ 
                  top: `${getStrikePosition(item.strike)}%`,
                  height: `${Math.min((item.openInterest / Math.max(...data.map(d => d.openInterest))) * 100, 100)}%`
                }}
              >
                {item.openInterest > 0 && (
                  <span className="oi-text">
                    {formatVolume(item.openInterest)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
        
        {/* Volume axis labels (right side) */}
        <div className="volume-axis-right">
          <div className="volume-label">{formatVolume(Math.max(...data.map(d => d.openInterest)))}</div>
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
        <div className="legend-item">
          <div className="legend-color oi"></div>
          <span>Open Interest</span>
        </div>
      </div>
    </div>
  );
};

export default VolumeProfileChart;
