import React, { useMemo, useState, useEffect, useRef } from 'react';
import { OptionData, parseTimestampFromData } from '../utils/dataParser';

interface PunchcardChartProps {
  trades: OptionData[];
  ticker: string;
}

interface PunchcardDataPoint {
  hour: number;
  minute: number; // 0 or 30 for 30-minute intervals
  timeSlot: number; // 0-47 (48 slots per day: 30-minute intervals)
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

  // Process trades data into punchcard format (30-minute intervals)
  const punchcardData = useMemo(() => {
    const dataMap = new Map<string, PunchcardDataPoint>();

    trades.forEach(trade => {
      const tradeDate = parseTimestampFromData(trade.timestamp);
      if (!tradeDate) return;

      const dateOnly = new Date(tradeDate.getFullYear(), tradeDate.getMonth(), tradeDate.getDate());
      const dateStr = dateOnly.toISOString().split('T')[0];
      const hour = tradeDate.getHours();
      const minute = tradeDate.getMinutes();
      // Round to nearest 30-minute interval
      const minuteSlot = minute < 30 ? 0 : 30;
      // Calculate time slot (0-47: 48 slots per day, 30 minutes each)
      const timeSlot = hour * 2 + (minuteSlot === 30 ? 1 : 0);

      const key = `${dateStr}_${timeSlot}`;

      if (!dataMap.has(key)) {
        dataMap.set(key, {
          hour,
          minute: minuteSlot,
          timeSlot,
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

  // Get unique dates and time slots (30-minute intervals)
  const { dates, timeSlots, maxVolume } = useMemo(() => {
    const dateSet = new Set<string>();
    const timeSlotSet = new Set<number>();

    punchcardData.forEach(point => {
      dateSet.add(point.date);
      timeSlotSet.add(point.timeSlot);
    });

    const sortedDates = Array.from(dateSet)
      .map(dateStr => new Date(dateStr))
      .sort((a, b) => b.getTime() - a.getTime()); // Most recent first

    // Get all time slots from 0-47 (full day in 30-minute intervals)
    // If we have data, use the range from min to max, otherwise show full day
    const allTimeSlots = Array.from({ length: 48 }, (_, i) => i); // 0-47
    const dataTimeSlots = Array.from(timeSlotSet);
    
    // Use all time slots if we have data spanning most of the day, otherwise use data range
    const minSlot = dataTimeSlots.length > 0 ? Math.min(...dataTimeSlots) : 0;
    const maxSlot = dataTimeSlots.length > 0 ? Math.max(...dataTimeSlots) : 47;
    
    // Show full day if data spans more than 12 hours, otherwise show data range with padding
    const sortedTimeSlots = (maxSlot - minSlot) > 24 
      ? allTimeSlots 
      : allTimeSlots.filter(slot => slot >= Math.max(0, minSlot - 2) && slot <= Math.min(47, maxSlot + 2));

    const maxVol = Math.max(...punchcardData.map(p => p.totalVolume), 1);

    return {
      dates: sortedDates,
      timeSlots: sortedTimeSlots,
      maxVolume: maxVol
    };
  }, [punchcardData]);

  // Get data point for a specific date and time slot
  const getDataPoint = (date: Date, timeSlot: number): PunchcardDataPoint | null => {
    const dateStr = date.toISOString().split('T')[0];
    return punchcardData.find(p => p.date === dateStr && p.timeSlot === timeSlot) || null;
  };

  // Calculate circle size based on volume (min 5px, max 40px)
  const getCircleSize = (volume: number): number => {
    if (volume === 0) return 0;
    const ratio = volume / maxVolume;
    return Math.max(5, Math.min(40, 5 + ratio * 35));
  };

  // Format time slot for display (30-minute intervals)
  const formatTimeSlot = (timeSlot: number): string => {
    const hour = Math.floor(timeSlot / 2);
    const minute = (timeSlot % 2) === 0 ? 0 : 30;
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}:${minute.toString().padStart(2, '0')}${period}`;
  };

  // Format date for display
  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: '2-digit'
    });
  };

  // Parse premium value
  const parsePremium = (premium: string): number => {
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
  };

  // Format premium for display
  const formatPremium = (premium: number): string => {
    if (premium >= 1000000) {
      return `$${(premium / 1000000).toFixed(1)}M`;
    } else if (premium >= 1000) {
      return `$${(premium / 1000).toFixed(1)}K`;
    }
    return `$${premium.toFixed(0)}`;
  };

  // Format full date and time
  const formatFullDateTime = (timestamp: string): string => {
    const date = parseTimestampFromData(timestamp);
    if (!date) return 'Unknown';
    
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  // Format expiry date
  const formatExpiryDate = (expiry: string): string => {
    const date = new Date(expiry);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
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

  if (dates.length === 0 || timeSlots.length === 0) {
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

  // Calculate dimensions - use 50% of width
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1200);
  
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        const width = containerRef.current.offsetWidth;
        setContainerWidth(width);
      }
    };
    
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  const cellHeight = 50;
  const chartWidthPercent = 50; // Use 50% of container width
  const availableWidth = (containerWidth * chartWidthPercent / 100) - 120; // Reserve space for y-axis labels and padding
  const cellWidth = Math.max(15, availableWidth / timeSlots.length); // Minimum 15px per cell
  const chartWidth = timeSlots.length * cellWidth + 100; // +100 for y-axis labels
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

      <div 
        ref={containerRef}
        className="punchcard-container" 
        style={{ overflowX: 'auto', overflowY: 'auto', width: '100%' }}
      >
        <svg width={chartWidth} height={chartHeight} style={{ minWidth: '100%' }}>
          {/* SVG Filters for glow effects */}
          <defs>
            <filter id="callGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
            <filter id="putGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>
          
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

          {/* X-axis labels (time slots - 30-minute intervals) */}
          {timeSlots.map((timeSlot, slotIndex) => {
            // Only show labels for every 2 slots (hourly) to avoid crowding
            const showLabel = timeSlot % 2 === 0; // Show every hour (every 2 slots)
            if (!showLabel) return null;
            
            return (
              <text
                key={timeSlot}
                x={slotIndex * cellWidth + cellWidth / 2 + 100}
                y={dates.length * cellHeight + 35}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#ccc"
                fontSize="10"
              >
                {formatTimeSlot(timeSlot)}
              </text>
            );
          })}

          {/* Grid lines */}
          {dates.map((_date, dateIndex) => (
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
          {timeSlots.map((timeSlot, slotIndex) => {
            // Show grid lines for every hour (every 2 slots) to reduce clutter
            const showGridLine = timeSlot % 2 === 0;
            if (!showGridLine) return null;
            
            return (
              <line
                key={`grid-v-${slotIndex}`}
                x1={slotIndex * cellWidth + 100}
                y1={25}
                x2={slotIndex * cellWidth + 100}
                y2={dates.length * cellHeight + 25}
                stroke="#333"
                strokeWidth="1"
              />
            );
          })}

          {/* Circles - 3D layered effect showing both call and put */}
          {dates.map((date, dateIndex) =>
            timeSlots.map((timeSlot, slotIndex) => {
              const dataPoint = getDataPoint(date, timeSlot);
              if (!dataPoint || dataPoint.totalVolume === 0) return null;

              const centerX = slotIndex * cellWidth + cellWidth / 2 + 100;
              const centerY = dateIndex * cellHeight + cellHeight / 2 + 25;

              // Calculate sizes for call and put circles
              const callSize = getCircleSize(dataPoint.callVolume);
              const putSize = getCircleSize(dataPoint.putVolume);
              
              // Offset for 3D effect (slight offset to show both)
              const offsetX = 3;
              const offsetY = 3;

              // Determine which circle should be on top (larger one)
              const callIsLarger = dataPoint.callVolume >= dataPoint.putVolume;

              return (
                <g
                  key={`${date.toISOString()}_${timeSlot}`}
                  onMouseEnter={(e) => handleCircleMouseEnter(e, dataPoint)}
                  onMouseLeave={handleCircleMouseLeave}
                  style={{ cursor: 'pointer' }}
                >
                  {/* Put circle (red) - bottom layer */}
                  {dataPoint.putVolume > 0 && (
                    <g>
                      {/* Shadow for 3D effect */}
                      <circle
                        cx={centerX + (callIsLarger ? offsetX : 0)}
                        cy={centerY + (callIsLarger ? offsetY : 0)}
                        r={putSize / 2}
                        fill="rgba(0, 0, 0, 0.3)"
                        opacity="0.5"
                      />
                      {/* Main put circle */}
                      <circle
                        cx={centerX + (callIsLarger ? offsetX : 0)}
                        cy={centerY + (callIsLarger ? offsetY : 0)}
                        r={putSize / 2}
                        fill="rgba(244, 67, 54, 0.85)"
                        stroke="#fff"
                        strokeWidth="1.5"
                        filter="url(#putGlow)"
                      />
                      {/* Highlight for 3D effect */}
                      <circle
                        cx={centerX + (callIsLarger ? offsetX : 0) - putSize / 6}
                        cy={centerY + (callIsLarger ? offsetY : 0) - putSize / 6}
                        r={putSize / 4}
                        fill="rgba(255, 255, 255, 0.3)"
                      />
                    </g>
                  )}
                  
                  {/* Call circle (green) - top layer */}
                  {dataPoint.callVolume > 0 && (
                    <g>
                      {/* Shadow for 3D effect */}
                      <circle
                        cx={centerX + (!callIsLarger ? offsetX : 0)}
                        cy={centerY + (!callIsLarger ? offsetY : 0)}
                        r={callSize / 2}
                        fill="rgba(0, 0, 0, 0.3)"
                        opacity="0.5"
                      />
                      {/* Main call circle */}
                      <circle
                        cx={centerX + (!callIsLarger ? offsetX : 0)}
                        cy={centerY + (!callIsLarger ? offsetY : 0)}
                        r={callSize / 2}
                        fill="rgba(76, 175, 80, 0.85)"
                        stroke="#fff"
                        strokeWidth="1.5"
                        filter="url(#callGlow)"
                      />
                      {/* Highlight for 3D effect */}
                      <circle
                        cx={centerX + (!callIsLarger ? offsetX : 0) - callSize / 6}
                        cy={centerY + (!callIsLarger ? offsetY : 0) - callSize / 6}
                        r={callSize / 4}
                        fill="rgba(255, 255, 255, 0.3)"
                      />
                    </g>
                  )}
                </g>
              );
            })
          )}
        </svg>
      </div>

      {/* Tooltip */}
      {tooltip.visible && tooltip.data && (() => {
        const data = tooltip.data; // Store in local variable to help TypeScript
        return (
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
              <span className="tooltip-date">{formatDate(data.dateObj)}</span>
              <span className="tooltip-time">{formatTimeSlot(data.timeSlot)}</span>
            </div>
            <div className="tooltip-body">
              <div className="tooltip-row">
                <span className="tooltip-label">Total Volume</span>
                <span className="tooltip-value">{data.totalVolume.toLocaleString()}</span>
              </div>
              <div className="tooltip-row">
                <span className="tooltip-label">Call Volume</span>
                <span className="tooltip-value" style={{ color: '#66bb6a' }}>
                  {data.callVolume.toLocaleString()}
                </span>
              </div>
              <div className="tooltip-row">
                <span className="tooltip-label">Put Volume</span>
                <span className="tooltip-value" style={{ color: '#ef5350' }}>
                  {data.putVolume.toLocaleString()}
                </span>
              </div>
              <div className="tooltip-row">
                <span className="tooltip-label">Trades</span>
                <span className="tooltip-value">{data.trades.length}</span>
              </div>
              {data.trades.length > 0 && (
                <div className="tooltip-trades">
                  <div className="tooltip-label" style={{ marginTop: '12px', marginBottom: '8px', fontWeight: 'bold', fontSize: '0.85rem', borderTop: '1px solid rgba(255, 255, 255, 0.2)', paddingTop: '8px' }}>
                    TRADE DETAILS
                  </div>
                  {data.trades.slice(0, 10).map((trade, idx) => {
                    const premiumValue = parsePremium(trade.premium);
                    const tradesLength = data.trades.length;
                    return (
                      <div key={idx} className="tooltip-trade-item" style={{ 
                        marginBottom: '8px', 
                        paddingBottom: '8px',
                        borderBottom: idx < Math.min(tradesLength, 10) - 1 ? '1px solid rgba(255, 255, 255, 0.1)' : 'none'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ fontWeight: '600', color: trade.optionType === 'Call' ? '#66bb6a' : '#ef5350' }}>
                            {trade.optionType} ${trade.strike}
                          </span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', fontSize: '0.75rem' }}>
                          <div>
                            <span style={{ color: '#aaa' }}>Vol:</span> <span style={{ color: '#fff' }}>{trade.volume.toLocaleString()}</span>
                          </div>
                          <div>
                            <span style={{ color: '#aaa' }}>Premium:</span> <span style={{ color: '#fff' }}>{formatPremium(premiumValue)}</span>
                          </div>
                          <div>
                            <span style={{ color: '#aaa' }}>Expiry:</span> <span style={{ color: '#fff' }}>{formatExpiryDate(trade.expiry)}</span>
                          </div>
                          <div>
                            <span style={{ color: '#aaa' }}>Time:</span> <span style={{ color: '#fff', fontSize: '0.7rem' }}>{formatFullDateTime(trade.timestamp)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {data.trades.length > 10 && (
                    <div className="tooltip-trade-item" style={{ fontStyle: 'italic', color: '#888', marginTop: '8px', textAlign: 'center' }}>
                      +{data.trades.length - 10} more trades
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default PunchcardChart;

