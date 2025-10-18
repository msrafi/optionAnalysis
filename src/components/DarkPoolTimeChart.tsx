import React, { useMemo } from 'react';
import { DarkPoolData } from '../utils/dataParser';

interface DarkPoolTimeChartProps {
  trades: DarkPoolData[];
  ticker: string;
}

interface TimeDataPoint {
  time: string;
  volume: number;
  tradeCount: number;
  avgPrice: number;
  totalValue: number;
}

const DarkPoolTimeChart: React.FC<DarkPoolTimeChartProps> = ({ trades }) => {
  const chartData = useMemo(() => {
    if (!trades || trades.length === 0) return [];

    // Group trades by time periods (hourly)
    const timeGroups = new Map<string, TimeDataPoint>();
    
    trades.forEach(trade => {
      const date = new Date(trade.timestamp);
      const timeKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:00`;
      
      if (timeGroups.has(timeKey)) {
        const existing = timeGroups.get(timeKey)!;
        existing.volume += trade.quantity;
        existing.tradeCount += 1;
        existing.totalValue += trade.price * trade.quantity;
        existing.avgPrice = existing.totalValue / existing.volume;
      } else {
        timeGroups.set(timeKey, {
          time: timeKey,
          volume: trade.quantity,
          tradeCount: 1,
          avgPrice: trade.price,
          totalValue: trade.price * trade.quantity
        });
      }
    });

    return Array.from(timeGroups.values()).sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
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
        <h3>Volume Over Time</h3>
        <div className="no-data">No trade data available for time analysis</div>
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
                  key={`${dataPoint.time}-${index}`}
                  className={`chart-bar ${isHighVolume ? 'high-volume' : ''}`}
                  style={{ height: `${height}%` }}
                  title={`Time: ${formatDateTime(dataPoint.time)}
Volume: ${formatVolume(dataPoint.volume)}
Trades: ${dataPoint.tradeCount}
Avg Price: $${dataPoint.avgPrice.toFixed(2)}
Total Value: ${formatValue(dataPoint.totalValue)}`}
                >
                  <div className="bar-value">{formatVolume(dataPoint.volume)}</div>
                </div>
              );
            })}
          </div>
          
          <div className="chart-x-axis">
            <div className="x-label">Time</div>
            <div className="x-scale">
              {chartData.map((dataPoint, index) => {
                return (
                  <div key={`time-${index}`} className="x-tick">
                    <span className="time-label">{formatDateTime(dataPoint.time)}</span>
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

export default DarkPoolTimeChart;
