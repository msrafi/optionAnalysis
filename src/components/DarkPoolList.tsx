import React, { memo, useState, useMemo } from 'react';
import { DarkPoolData } from '../utils/dataParser';

interface DarkPoolListProps {
  trades: DarkPoolData[];
  ticker?: string;
}

interface DarkPoolRowProps {
  trade: DarkPoolData;
}

const DarkPoolRow: React.FC<DarkPoolRowProps> = memo(({ trade }) => {
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
  const isHighValue = totalValue >= 100000000; // $100M+

  return (
    <div 
      className="darkpool-row-horizontal"
      style={{
        backgroundColor: isHighValue 
          ? 'rgba(255, 165, 0, 0.7)' // Orange for high value trades
          : 'rgba(0, 100, 200, 0.5)', // Blue for normal trades
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

const DarkPoolList: React.FC<DarkPoolListProps> = memo(({ trades, ticker }) => {
  const [sortBy, setSortBy] = useState<SortOption>('timestamp');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

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
            <DarkPoolRow key={`${trade.ticker}-${trade.timestamp}-${index}`} trade={trade} />
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
