import React, { useMemo, useState } from 'react';
import { OptionData, parseTimestampFromData } from '../utils/dataParser';

interface PunchcardChartProps {
  trades: OptionData[];
  ticker: string;
}

interface PunchcardDataPoint {
  hour: number;
  date: string;
  dateObj: Date;
  callVolume: number;
  putVolume: number;
  totalVolume: number;
  trades: OptionData[];
}

const PunchcardChart: React.FC<PunchcardChartProps> = ({ trades, ticker }) => {
  const [tooltip, setTooltip] = useState<{
    visible: boolean;
    x: number;
    y: number;
    data: PunchcardDataPoint | null;
  }>({
    visible: false,
    x: 0,
    y: 0,
    data: null
  });

  // Process trades data into punchcard format
  const punchcardData = useMemo(() => {
    const dataMap = new Map<string, PunchcardDataPoint>();

    trades.forEach(trade => {
      const tradeDate = parseTimestampFromData(trade.timestamp);
      if (!tradeDate) return;

      const dateOnly = new Date(tradeDate.getFullYear(), tradeDate.getMonth(), tradeDate.getDate());
      const dateStr = dateOnly.toISOString().split('T')[0];
      const hour = tradeDate.getHours();

      const key = `${dateStr}_${hour}`;

      if (!dataMap.has(key)) {
        dataMap.set(key, {
          hour,
          date: dateStr,
          dateObj: dateOnly,
          callVolume: 0,
          putVolume: 0,
          totalVolume: 0,
          trades: []
        });
      }

      const point = dataMap.get(key)!;
      point.trades.push(trade);
      point.totalVolume += trade.volume;

      if (trade.optionType === 'Call') {
        point.callVolume += trade.volume;
      } else {
        point.putVolume += trade.volume;
      }
    });

    return Array.from(dataMap.values());
  }, [trades]);

  // Get unique dates and hours
  const { dates, hours, maxVolume } = useMemo(() => {
    const dateSet = new Set<string>();
    const hourSet = new Set<number>();

    punchcardData.forEach(point => {
      dateSet.add(point.date);
      hourSet.add(point.hour);
    });

    const sortedDates = Array.from(dateSet)
      .map(dateStr => new Date(dateStr))
      .sort((a, b) => b.getTime() - a.getTime()); // Most recent first

    const sortedHours = Array.from(hourSet).sort((a, b) => a - b);

    const maxVol = Math.max(...punchcardData.map(p => p.totalVolume), 1);

    return {
      dates: sortedDates,
      hours: sortedHours,
      maxVolume: maxVol
    };
  }, [punchcardData]);

  // Get data point for a specific date and hour
  const getDataPoint = (date: Date, hour: number): PunchcardDataPoint | null => {
    const dateStr = date.toISOString().split('T')[0];
    return punchcardData.find(p => p.date === dateStr && p.hour === hour) || null;
  };

  // Calculate circle size based on volume (min 5px, max 40px)
  const getCircleSize = (volume: number): number => {
    if (volume === 0) return 0;
    const ratio = volume / maxVolume;
    return Math.max(5, Math.min(40, 5 + ratio * 35));
  };

  // Format hour for display
  const formatHour = (hour: number): string => {
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}${period}`;
  };

  // Format date for display
  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: '2-digit'
    });
  };

  const handleCircleMouseEnter = (e: React.MouseEvent, data: PunchcardDataPoint) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({
      visible: true,
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      data
    });
  };

  const handleCircleMouseLeave = () => {
    setTooltip(prev => ({ ...prev, visible: false }));
  };

  if (dates.length === 0 || hours.length === 0) {
    return (
      <div className="punchcard-chart">
        <div className="punchcard-header">
          <h3>Purchase Time Punchcard - {ticker}</h3>
        </div>
        <div className="punchcard-no-data">
          <p>No data available for punchcard visualization</p>
        </div>
      </div>
    );
  }

  // Calculate dimensions
  const cellWidth = 50;
  const cellHeight = 50;
  const chartWidth = hours.length * cellWidth + 100; // +100 for y-axis labels
  const chartHeight = dates.length * cellHeight + 50; // +50 for x-axis labels

  return (
    <div className="punchcard-chart">
      <div className="punchcard-header">
        <h3>Purchase Time Punchcard - {ticker}</h3>
        <div className="punchcard-legend">
          <div className="legend-item">
            <div className="legend-circle" style={{ background: 'rgba(76, 175, 80, 0.8)', width: '20px', height: '20px', borderRadius: '50%' }}></div>
            <span>Call Volume</span>
          </div>
          <div className="legend-item">
            <div className="legend-circle" style={{ background: 'rgba(244, 67, 54, 0.8)', width: '20px', height: '20px', borderRadius: '50%' }}></div>
            <span>Put Volume</span>
          </div>
        </div>
      </div>

      <div className="punchcard-container" style={{ overflowX: 'auto', overflowY: 'auto' }}>
        <svg width={chartWidth} height={chartHeight} style={{ minWidth: '100%' }}>
          {/* Y-axis labels (dates) */}
          {dates.map((date, dateIndex) => (
            <text
              key={date.toISOString()}
              x={5}
              y={dateIndex * cellHeight + cellHeight / 2 + 25}
              textAnchor="start"
              dominantBaseline="middle"
              fill="#ccc"
              fontSize="12"
            >
              {formatDate(date)}
            </text>
          ))}

          {/* X-axis labels (hours) */}
          {hours.map((hour, hourIndex) => (
            <text
              key={hour}
              x={hourIndex * cellWidth + cellWidth / 2 + 100}
              y={dates.length * cellHeight + 35}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#ccc"
              fontSize="11"
            >
              {formatHour(hour)}
            </text>
          ))}

          {/* Grid lines */}
          {dates.map((date, dateIndex) => (
            <line
              key={`grid-h-${dateIndex}`}
              x1={100}
              y1={dateIndex * cellHeight + 25}
              x2={chartWidth}
              y2={dateIndex * cellHeight + 25}
              stroke="#333"
              strokeWidth="1"
            />
          ))}
          {hours.map((hour, hourIndex) => (
            <line
              key={`grid-v-${hourIndex}`}
              x1={hourIndex * cellWidth + 100}
              y1={25}
              x2={hourIndex * cellWidth + 100}
              y2={dates.length * cellHeight + 25}
              stroke="#333"
              strokeWidth="1"
            />
          ))}

          {/* Circles */}
          {dates.map((date, dateIndex) =>
            hours.map((hour, hourIndex) => {
              const dataPoint = getDataPoint(date, hour);
              if (!dataPoint || dataPoint.totalVolume === 0) return null;

              const centerX = hourIndex * cellWidth + cellWidth / 2 + 100;
              const centerY = dateIndex * cellHeight + cellHeight / 2 + 25;

              // Determine color based on which is larger (call or put)
              const isCallDominant = dataPoint.callVolume >= dataPoint.putVolume;
              const color = isCallDominant
                ? 'rgba(76, 175, 80, 0.8)'
                : 'rgba(244, 67, 54, 0.8)';

              const circleSize = getCircleSize(dataPoint.totalVolume);

              return (
                <circle
                  key={`${date.toISOString()}_${hour}`}
                  cx={centerX}
                  cy={centerY}
                  r={circleSize / 2}
                  fill={color}
                  stroke="#fff"
                  strokeWidth="1"
                  onMouseEnter={(e) => handleCircleMouseEnter(e, dataPoint)}
                  onMouseLeave={handleCircleMouseLeave}
                  style={{ cursor: 'pointer' }}
                />
              );
            })
          )}
        </svg>
      </div>

      {/* Tooltip */}
      {tooltip.visible && tooltip.data && (
        <div
          className="modern-tooltip punchcard-tooltip"
          style={{
            position: 'fixed',
            left: `${tooltip.x + 15}px`,
            top: `${tooltip.y}px`,
            transform: 'translateY(-50%)',
            pointerEvents: 'auto',
            zIndex: 9999
          }}
          onMouseEnter={() => setTooltip(prev => ({ ...prev, visible: true }))}
          onMouseLeave={handleCircleMouseLeave}
        >
          <div className="tooltip-header">
            <span className="tooltip-date">{formatDate(tooltip.data.dateObj)}</span>
            <span className="tooltip-time">{formatHour(tooltip.data.hour)}</span>
          </div>
          <div className="tooltip-body">
            <div className="tooltip-row">
              <span className="tooltip-label">Total Volume</span>
              <span className="tooltip-value">{tooltip.data.totalVolume.toLocaleString()}</span>
            </div>
            <div className="tooltip-row">
              <span className="tooltip-label">Call Volume</span>
              <span className="tooltip-value" style={{ color: '#66bb6a' }}>
                {tooltip.data.callVolume.toLocaleString()}
              </span>
            </div>
            <div className="tooltip-row">
              <span className="tooltip-label">Put Volume</span>
              <span className="tooltip-value" style={{ color: '#ef5350' }}>
                {tooltip.data.putVolume.toLocaleString()}
              </span>
            </div>
            <div className="tooltip-row">
              <span className="tooltip-label">Trades</span>
              <span className="tooltip-value">{tooltip.data.trades.length}</span>
            </div>
            {tooltip.data.trades.length > 0 && (
              <div className="tooltip-trades">
                <div className="tooltip-label" style={{ marginTop: '8px', marginBottom: '4px' }}>Trade Details:</div>
                {tooltip.data.trades.slice(0, 5).map((trade, idx) => (
                  <div key={idx} className="tooltip-trade-item">
                    <span>{trade.optionType} ${trade.strike} - Vol: {trade.volume.toLocaleString()}</span>
                  </div>
                ))}
                {tooltip.data.trades.length > 5 && (
                  <div className="tooltip-trade-item" style={{ fontStyle: 'italic', color: '#888' }}>
                    +{tooltip.data.trades.length - 5} more trades
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PunchcardChart;

