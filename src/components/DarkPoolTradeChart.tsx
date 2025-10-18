import React, { useMemo } from 'react';
import { DarkPoolData } from '../utils/dataParser';

interface DarkPoolTradeChartProps {
  trades: DarkPoolData[];
  ticker: string;
}

interface ChartDataPoint {
  price: number;
  volume: number;
  timestamp: string;
  value: number;
}

const DarkPoolTradeChart: React.FC<DarkPoolTradeChartProps> = ({ trades }) => {
  const chartData = useMemo(() => {
    if (!trades || trades.length === 0) return [];

    // Sort trades by price for better visualization
    const sortedTrades = [...trades].sort((a, b) => a.price - b.price);
    
    // Group trades by price ranges for better visualization
    const priceGroups = new Map<number, ChartDataPoint>();
    
    sortedTrades.forEach(trade => {
      const roundedPrice = Math.round(trade.price * 100) / 100; // Round to 2 decimal places
      
      if (priceGroups.has(roundedPrice)) {
        const existing = priceGroups.get(roundedPrice)!;
        existing.volume += trade.quantity;
        existing.value += trade.price * trade.quantity;
        // Keep the most recent timestamp for this price level
        if (new Date(trade.timestamp) > new Date(existing.timestamp)) {
          existing.timestamp = trade.timestamp;
        }
      } else {
        priceGroups.set(roundedPrice, {
          price: roundedPrice,
          volume: trade.quantity,
          timestamp: trade.timestamp,
          value: trade.price * trade.quantity
        });
      }
    });

    return Array.from(priceGroups.values()).sort((a, b) => a.price - b.price);
  }, [trades]);

  const maxVolume = useMemo(() => {
    return Math.max(...chartData.map(d => d.volume), 1);
  }, [chartData]);


  const formatVolume = (volume: number): string => {
    if (volume >= 1000000) {
      return `${(volume / 1000000).toFixed(1)}M`;
    } else if (volume >= 1000) {
      return `${(volume / 1000).toFixed(1)}K`;
    }
    return volume.toString();
  };

  const formatValue = (value: number): string => {
    if (value >= 1000000000) {
      return `$${(value / 1000000000).toFixed(1)}B`;
    } else if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`;
    } else if (value >= 1000) {
      return `$${(value / 1000).toFixed(1)}K`;
    }
    return `$${value.toFixed(2)}`;
  };

  const formatDateTime = (timestamp: string): string => {
    try {
      const time = new Date(timestamp);
      if (isNaN(time.getTime())) return '';
      
      return time.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    } catch (error) {
      return '';
    }
  };

  if (chartData.length === 0) {
    return (
      <div className="chart-container">
        <h3>Trade Distribution Chart</h3>
        <div className="no-data">No trade data available for charting</div>
      </div>
    );
  }

  return (
    <div className="chart-container">
      
      <div className="chart-content">
        <div className="chart-y-axis">
          <div className="y-label">Volume</div>
          <div className="y-scale">
            <div className="scale-value">{formatVolume(maxVolume)}</div>
            <div className="scale-value">{formatVolume(maxVolume * 0.75)}</div>
            <div className="scale-value">{formatVolume(maxVolume * 0.5)}</div>
            <div className="scale-value">{formatVolume(maxVolume * 0.25)}</div>
            <div className="scale-value">0</div>
          </div>
        </div>
        
        <div className="chart-main">
          <div className="chart-bars">
            {chartData.map((dataPoint, index) => {
              const height = (dataPoint.volume / maxVolume) * 100;
              const isHighVolume = dataPoint.volume > maxVolume * 0.8;
              
              return (
                <div
                  key={`${dataPoint.price}-${index}`}
                  className={`chart-bar ${isHighVolume ? 'high-volume' : ''}`}
                  style={{ height: `${height}%` }}
                  title={`Price: $${dataPoint.price.toFixed(2)}
Volume: ${formatVolume(dataPoint.volume)}
Value: ${formatValue(dataPoint.value)}
Time: ${formatDateTime(dataPoint.timestamp)}`}
                >
                  <div className="bar-value">{formatVolume(dataPoint.volume)}</div>
                </div>
              );
            })}
          </div>
          
          <div className="chart-x-axis">
            <div className="x-label">Price ($)</div>
            <div className="x-scale">
              {chartData.map((dataPoint, index) => {
                return (
                  <div key={`price-${index}`} className="x-tick">
                    <span className="price-label">${dataPoint.price.toFixed(2)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DarkPoolTradeChart;
