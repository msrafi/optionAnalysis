import React, { memo, useState, useMemo } from 'react';
import { DarkPoolData } from '../utils/dataParser';

interface DarkPoolListProps {
  trades: DarkPoolData[];
  ticker?: string;
}

interface DarkPoolRowProps {
  trade: DarkPoolData;
  volumeStats: {
    mean: number;
    stdDev: number;
    q75: number;
    q90: number;
    q95: number;
  };
  valueStats: {
    mean: number;
    stdDev: number;
    q75: number;
    q90: number;
    q95: number;
  };
}

const DarkPoolRow: React.FC<DarkPoolRowProps> = memo(({ trade, volumeStats, valueStats }) => {
  const formatExecutionDateTime = (timestamp: string): string => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });
    } catch (error) {
      return 'Unknown';
    }
  };

  const formatQuantity = (quantity: number): string => {
    if (quantity >= 1000000) {
      return `${(quantity / 1000000).toFixed(1)}M`;
    } else if (quantity >= 1000) {
      return `${(quantity / 1000).toFixed(1)}K`;
    }
    return quantity.toLocaleString();
  };

  // Parse total value to check if it's a high-value trade
  const parseTotalValue = (totalValue: string): number => {
    const cleanValue = totalValue.replace(/[$,]/g, '');
    const num = parseFloat(cleanValue);
    
    if (totalValue.includes('M')) {
      return num * 1000000;
    } else if (totalValue.includes('K')) {
      return num * 1000;
    }
    return num;
  };

  const totalValue = parseTotalValue(trade.totalValue);
  
  // Determine color based on statistical analysis
  const getRowColor = () => {
    
    // Unusual trades (top 10% in volume or value)
    if (trade.quantity >= volumeStats.q90 || totalValue >= valueStats.q90) {
      return 'rgba(0, 200, 0, 0.6)'; // Green for unusual trades
    }
    
    // Default: White for all other trades
    return 'rgba(255, 255, 255, 0.1)'; // White for normal trades
  };

  return (
    <div 
      className="darkpool-row-horizontal"
      style={{
        backgroundColor: getRowColor(),
        borderLeft: trade.quantity >= volumeStats.q90 || totalValue >= valueStats.q90
          ? '4px solid #00c800'
          : 'none'
      }}
    >
      <div className="darkpool-cell-h symbol">{trade.ticker}</div>
      <div className="darkpool-cell-h quantity">{formatQuantity(trade.quantity)}</div>
      <div className="darkpool-cell-h price">${trade.price.toFixed(2)}</div>
      <div className="darkpool-cell-h total-value">{trade.totalValue}</div>
      <div className="darkpool-cell-h exec-time">{formatExecutionDateTime(trade.timestamp)}</div>
    </div>
  );
});

DarkPoolRow.displayName = 'DarkPoolRow';

type SortOption = 'timestamp' | 'quantity' | 'total-value' | 'price';

// Helper function to calculate statistics
const calculateStats = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);
  
  const q75Index = Math.floor(sorted.length * 0.75);
  const q90Index = Math.floor(sorted.length * 0.90);
  const q95Index = Math.floor(sorted.length * 0.95);
  
  return {
    mean,
    stdDev,
    q75: sorted[q75Index] || 0,
    q90: sorted[q90Index] || 0,
    q95: sorted[q95Index] || 0
  };
};

const DarkPoolList: React.FC<DarkPoolListProps> = memo(({ trades, ticker }) => {
  const [sortBy, setSortBy] = useState<SortOption>('timestamp');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Calculate statistics for volume and value
  const { volumeStats, valueStats } = useMemo(() => {
    if (trades.length === 0) {
      return {
        volumeStats: { mean: 0, stdDev: 0, q75: 0, q90: 0, q95: 0 },
        valueStats: { mean: 0, stdDev: 0, q75: 0, q90: 0, q95: 0 }
      };
    }

    const volumes = trades.map(trade => trade.quantity);
    const values = trades.map(trade => {
      const cleanValue = trade.totalValue.replace(/[$,]/g, '');
      const num = parseFloat(cleanValue);
      
      if (trade.totalValue.includes('M')) {
        return num * 1000000;
      } else if (trade.totalValue.includes('K')) {
        return num * 1000;
      }
      return num;
    });

    return {
      volumeStats: calculateStats(volumes),
      valueStats: calculateStats(values)
    };
  }, [trades]);

  const sortedTrades = useMemo(() => {
    const sorted = [...trades].sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'timestamp':
          comparison = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
          break;
        case 'quantity':
          comparison = a.quantity - b.quantity;
          break;
        case 'price':
          comparison = a.price - b.price;
          break;
        case 'total-value':
          const aValue = parseFloat(a.totalValue.replace(/[$,]/g, ''));
          const bValue = parseFloat(b.totalValue.replace(/[$,]/g, ''));
          comparison = aValue - bValue;
          break;
        default:
          comparison = 0;
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });
    
    return sorted;
  }, [trades, sortBy, sortOrder]);

  const handleSort = (newSortBy: SortOption) => {
    if (sortBy === newSortBy) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(newSortBy);
      setSortOrder('desc');
    }
  };

  const getSortIcon = (column: SortOption) => {
    if (sortBy !== column) return '↕️';
    return sortOrder === 'asc' ? '↑' : '↓';
  };

  const totalValue = trades.reduce((sum, trade) => {
    const value = parseFloat(trade.totalValue.replace(/[$,]/g, ''));
    return sum + value;
  }, 0);

  const formatTotalValue = (value: number): string => {
    if (value >= 1000000000) {
      return `$${(value / 1000000000).toFixed(1)}B`;
    } else if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`;
    } else if (value >= 1000) {
      return `$${(value / 1000).toFixed(1)}K`;
    }
    return `$${value.toFixed(0)}`;
  };

  return (
    <div className="darkpool-list-container">
      <div className="darkpool-list-header">
        <h3>Dark Pool Trades{ticker ? ` for ${ticker}` : ''}</h3>
        <div className="darkpool-stats">
          <span className="stat-item">
            <strong>{trades.length}</strong> trades
          </span>
          <span className="stat-item">
            <strong>{formatTotalValue(totalValue)}</strong> total value
          </span>
        </div>
      </div>
      
      {/* Color Legend */}
      <div className="darkpool-legend">
        <div className="legend-title">Trade Volume/Value Indicators:</div>
        <div className="legend-items">
          <div className="legend-item">
            <div className="legend-color unusual"></div>
            <span>Unusual (Top 10%)</span>
          </div>
          <div className="legend-item">
            <div className="legend-color normal"></div>
            <span>Normal</span>
          </div>
        </div>
      </div>
      
      <div className="darkpool-list-table">
        <div className="darkpool-header-row">
          <div 
            className="darkpool-header-cell symbol"
            onClick={() => handleSort('timestamp')}
          >
            Symbol {getSortIcon('timestamp')}
          </div>
          <div 
            className="darkpool-header-cell quantity"
            onClick={() => handleSort('quantity')}
          >
            Quantity {getSortIcon('quantity')}
          </div>
          <div 
            className="darkpool-header-cell price"
            onClick={() => handleSort('price')}
          >
            Price {getSortIcon('price')}
          </div>
          <div 
            className="darkpool-header-cell total-value"
            onClick={() => handleSort('total-value')}
          >
            Total Value {getSortIcon('total-value')}
          </div>
          <div 
            className="darkpool-header-cell exec-time"
            onClick={() => handleSort('timestamp')}
          >
            Execution Time {getSortIcon('timestamp')}
          </div>
        </div>
        
        <div className="darkpool-trades-container">
          {sortedTrades.map((trade, index) => (
            <DarkPoolRow 
              key={`${trade.ticker}-${trade.timestamp}-${index}`} 
              trade={trade}
              volumeStats={volumeStats}
              valueStats={valueStats}
            />
          ))}
        </div>
      </div>
      
      {trades.length === 0 && (
        <div className="no-trades-message">
          <p>No dark pool trades found{ticker ? ` for ${ticker}` : ''}.</p>
        </div>
      )}
    </div>
  );
});

DarkPoolList.displayName = 'DarkPoolList';

export default DarkPoolList;
