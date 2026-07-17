import React from 'react';
import { clearRobinhoodTradeLog, getRobinhoodTradeLog, RobinhoodTradeLogEntry } from '../utils/robinhoodTradeLog';

interface RobinhoodTradeLogModalProps {
  onClose: () => void;
  onClear?: () => void;
}

function formatSubmittedAt(iso: string): string {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return iso;
  return new Date(parsed).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatExpiry(iso: string): string {
  const parsed = Date.parse(`${iso}T12:00:00`);
  if (!Number.isFinite(parsed)) return iso;
  return new Date(parsed).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatPrice(entry: RobinhoodTradeLogEntry): string {
  if (entry.orderType === 'market') return 'Market';
  if (entry.limitPrice == null) return '-';
  return `$${entry.limitPrice.toFixed(2)}`;
}

function sourceLabel(source: RobinhoodTradeLogEntry['source']): string {
  return source === 'heatmap' ? 'Heatmap premium' : 'Volume flow';
}

const RobinhoodTradeLogModal: React.FC<RobinhoodTradeLogModalProps> = ({ onClose, onClear }) => {
  const entries = getRobinhoodTradeLog();

  const handleClear = () => {
    clearRobinhoodTradeLog();
    onClear?.();
    onClose();
  };

  return (
    <div className="rh-trade-modal-overlay" onClick={onClose}>
      <div
        className="rh-trade-modal rh-trade-log-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rh-trade-log-title"
      >
        <div className="rh-trade-modal-header">
          <h3 id="rh-trade-log-title">Robinhood Live Trade Log</h3>
          <button type="button" className="rh-trade-modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="rh-trade-modal-body">
          <p className="rh-trade-muted">
            Orders sent to your live Robinhood account from this browser. Only successful submissions are logged here.
          </p>

          {entries.length === 0 ? (
            <p className="rh-trade-log-empty">No live trades have been sent yet.</p>
          ) : (
            <div className="rh-trade-log-table-wrap">
              <table className="rh-trade-log-table">
                <thead>
                  <tr>
                    <th>Sent</th>
                    <th>Contract</th>
                    <th>Side</th>
                    <th>Qty</th>
                    <th>Price</th>
                    <th>Status</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.id}>
                      <td>{formatSubmittedAt(entry.createdAt)}</td>
                      <td>
                        <div className="rh-trade-log-contract">
                          <strong>
                            {entry.symbol} {entry.strike} {entry.optionType}
                          </strong>
                          <span>{formatExpiry(entry.expirationIso)}</span>
                          <span className="rh-trade-log-occ">{entry.contractSymbol}</span>
                        </div>
                      </td>
                      <td>{entry.side.toUpperCase()}</td>
                      <td>{entry.quantity}</td>
                      <td>{formatPrice(entry)}</td>
                      <td>
                        <span className="rh-trade-log-state">{entry.state || 'submitted'}</span>
                        {entry.orderId && <span className="rh-trade-log-order-id">{entry.orderId}</span>}
                      </td>
                      <td>{sourceLabel(entry.source)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rh-trade-modal-actions">
          {entries.length > 0 && (
            <button type="button" className="rh-trade-btn secondary" onClick={handleClear}>
              Clear Log
            </button>
          )}
          <button type="button" className="rh-trade-btn primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default RobinhoodTradeLogModal;
